"use client";

import * as React from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  LinearProgress,
  Paper,
  Collapse,
  FormControlLabel,
  Checkbox,
  Divider,
  Stack,
} from "@mui/material";
import { CloudUpload } from "@mui/icons-material";
import { apiClient } from "@/lib/api";
import { IngestionStatus } from "@/types";

interface IngestionFormProps {
  onSuccess?: (repoUrl: string, repoName: string) => void;
}

export default function IngestionForm({ onSuccess }: IngestionFormProps) {
  const [repoUrl, setRepoUrl] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<IngestionStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<any>(null);

  // Ingestion options
  const [includeCommits, setIncludeCommits] = React.useState(true);
  const [includeIssues, setIncludeIssues] = React.useState(false);
  const [includePrs, setIncludePrs] = React.useState(false);
  const [maxCommits, setMaxCommits] = React.useState(100);

  const extractRepoName = (url: string): string => {
    // Extract repo name from URL like "https://github.com/owner/repo" -> "owner/repo"
    const match = url.match(/github\.com\/([^\/]+\/[^\/]+)/);
    return match ? match[1] : url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate that at least one content type is selected
    if (!includeCommits && !includeIssues && !includePrs) {
      setError("Please select at least one content type to ingest");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient.ingestRepository({
        repo_url: repoUrl,
        include_commits: includeCommits,
        include_issues: includeIssues,
        include_prs: includePrs,
        max_commits: includeCommits ? maxCommits : 0,
      });

      setJobId(response.job_id);
      setStatus(response.status);

      // Start polling for status
      pollStatus(response.job_id, repoUrl);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || err.message || "Failed to start ingestion"
      );
      setIsSubmitting(false);
    }
  };

  const pollStatus = async (jobId: string, repoUrl: string) => {
    let pollCount = 0;
    const maxPolls = 150; // 5 minutes max (150 * 2 seconds)

    const interval = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        clearInterval(interval);
        setError("Ingestion timed out. Please check backend logs.");
        setIsSubmitting(false);
        return;
      }

      try {
        const statusResponse = await apiClient.getIngestionStatus(jobId);
        console.log(
          "Poll status:",
          statusResponse.status,
          statusResponse.progress
        );
        setStatus(statusResponse.status);
        setProgress(statusResponse.progress);

        if (statusResponse.status === IngestionStatus.COMPLETED) {
          clearInterval(interval);
          setIsSubmitting(false);

          const repoName = extractRepoName(repoUrl);
          console.log(
            "Ingestion completed! Calling onSuccess with:",
            repoUrl,
            repoName
          );

          if (onSuccess) {
            onSuccess(repoUrl, repoName);
          }

          // Keep success message visible
          setTimeout(() => {
            setJobId(null);
            setStatus(null);
            setProgress(null);
          }, 5000);
        } else if (statusResponse.status === IngestionStatus.FAILED) {
          clearInterval(interval);
          setIsSubmitting(false);
          setError(statusResponse.error_message || "Ingestion failed");
        }
      } catch (err: any) {
        console.error("Failed to poll status:", err);

        // If job not found (404), it might have completed before server reloaded
        if (err.response?.status === 404) {
          clearInterval(interval);
          setIsSubmitting(false);

          // Assume success and try to load branches anyway
          const repoName = extractRepoName(repoUrl);
          console.log(
            "Job not found (404), assuming completion. Calling onSuccess..."
          );

          setStatus(IngestionStatus.COMPLETED);
          if (onSuccess) {
            onSuccess(repoUrl, repoName);
          }

          setTimeout(() => {
            setJobId(null);
            setStatus(null);
            setProgress(null);
          }, 3000);
        } else {
          clearInterval(interval);
          setIsSubmitting(false);
          setError(
            err.response?.data?.detail ||
              err.message ||
              "Failed to check ingestion status"
          );
        }
      }
    }, 2000); // Poll every 2 seconds
  };

  const getProgressMessage = () => {
    if (!progress) return "Starting...";

    const stage = progress.stage;
    switch (stage) {
      case "cloning_repository":
        return "Cloning repository...";
      case "extracting_code":
        return "Extracting code files...";
      case "extracting_commits":
        return "Extracting commit history...";
      case "processing_documents":
        return "Processing documents...";
      case "uploading_to_s3":
        return `Uploading to S3... (${
          progress.total_documents || 0
        } documents)`;
      case "syncing_knowledge_base":
        return "Syncing with Knowledge Base...";
      case "cleaning_up":
        return "Cleaning up...";
      case "completed":
        return `Completed! Processed ${
          progress.total_documents || 0
        } documents.`;
      default:
        return "Processing...";
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        Ingest GitHub Repository
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add a GitHub repository to analyze commits with AI-powered explanations.
      </Typography>

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="GitHub Repository URL"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          required
          disabled={isSubmitting}
          sx={{ mb: 3 }}
        />

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" gutterBottom fontWeight={600}>
          Ingestion Options
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose what content to include from the repository
        </Typography>

        <Stack spacing={2} sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeCommits}
                onChange={(e) => setIncludeCommits(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include commit history"
          />

          {includeCommits && (
            <Box sx={{ ml: 4, mb: 2 }}>
              <TextField
                label="Maximum commits to ingest"
                type="number"
                value={maxCommits}
                onChange={(e) => setMaxCommits(parseInt(e.target.value) || 0)}
                disabled={isSubmitting}
                size="small"
                inputProps={{ min: 1, max: 1000 }}
                sx={{ width: 250 }}
              />
            </Box>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={includeIssues}
                onChange={(e) => setIncludeIssues(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include issues"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={includePrs}
                onChange={(e) => setIncludePrs(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include pull requests"
          />
        </Stack>

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={
            isSubmitting ||
            !repoUrl ||
            (!includeCommits && !includeIssues && !includePrs)
          }
          startIcon={
            isSubmitting ? <CircularProgress size={20} /> : <CloudUpload />
          }
          fullWidth
        >
          {isSubmitting ? "Ingesting Repository..." : "Ingest Repository"}
        </Button>

        {/* Status Display */}
        <Collapse in={isSubmitting || status === IngestionStatus.COMPLETED}>
          <Box sx={{ mt: 3 }}>
            {status !== IngestionStatus.COMPLETED && <LinearProgress />}
            <Alert
              severity={
                status === IngestionStatus.COMPLETED
                  ? "success"
                  : status === IngestionStatus.FAILED
                  ? "error"
                  : "info"
              }
              sx={{ mt: 2 }}
            >
              {status === IngestionStatus.COMPLETED
                ? "Repository ingested successfully! Loading branches..."
                : getProgressMessage()}
            </Alert>
          </Box>
        </Collapse>

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>
    </Paper>
  );
}
