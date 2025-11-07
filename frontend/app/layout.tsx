'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { lightTheme, darkTheme } from '@/theme/theme';
import { Box, IconButton, AppBar, Toolbar, Typography, Container } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [darkMode, setDarkMode] = React.useState(false);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  const theme = darkMode ? darkTheme : lightTheme;

  return (
    <html lang="en">
      <head>
        <title>RAG Knowledge Platform</title>
        <meta name="description" content="AI-powered knowledge platform for software repositories" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <AppBar position="static" elevation={1}>
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
                  🔍 RAG Knowledge Platform
                </Typography>
                <IconButton color="inherit" onClick={toggleTheme}>
                  {darkMode ? <Brightness7 /> : <Brightness4 />}
                </IconButton>
              </Toolbar>
            </AppBar>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flex: 1 }}>
              {children}
            </Container>
            <Box
              component="footer"
              sx={{
                py: 3,
                px: 2,
                mt: 'auto',
                backgroundColor: theme.palette.background.paper,
                borderTop: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Container maxWidth="xl">
                <Typography variant="body2" color="text.secondary" align="center">
                  RAG Knowledge Platform - Powered by AWS Bedrock
                </Typography>
              </Container>
            </Box>
          </Box>
        </ThemeProvider>
      </body>
    </html>
  );
}

