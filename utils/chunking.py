"""
Smart code chunking utilities that respect function and class boundaries.
"""
import re
from typing import List, Dict, Any, Tuple
from pathlib import Path


class CodeChunker:
    """Handles intelligent code chunking for various file types."""
    
    # File extensions and their comment styles
    COMMENT_STYLES = {
        '.py': '#',
        '.js': '//',
        '.ts': '//',
        '.jsx': '//',
        '.tsx': '//',
        '.java': '//',
        '.cpp': '//',
        '.c': '//',
        '.go': '//',
        '.rs': '//',
        '.rb': '#',
        '.php': '//',
        '.swift': '//',
        '.kt': '//',
    }
    
    def __init__(self, max_chunk_size: int = 1500, overlap: int = 200):
        """
        Initialize the code chunker.
        
        Args:
            max_chunk_size: Maximum characters per chunk
            overlap: Number of characters to overlap between chunks
        """
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
    
    def chunk_code_file(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """
        Chunk a code file intelligently based on its structure.
        
        Args:
            content: File content
            file_path: Path to the file (used for extension detection)
            
        Returns:
            List of chunks with metadata
        """
        file_ext = Path(file_path).suffix.lower()
        
        # Try Python-specific chunking for Python files
        if file_ext == '.py':
            return self._chunk_python_file(content, file_path)
        
        # Try general function-based chunking
        return self._chunk_by_functions(content, file_path)
    
    def _chunk_python_file(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Chunk Python file by classes and functions."""
        chunks = []
        lines = content.split('\n')
        current_chunk = []
        current_chunk_start_line = 1
        indent_stack = []
        
        for i, line in enumerate(lines, 1):
            # Detect class or function definitions
            if re.match(r'^(class|def|async def)\s+\w+', line.strip()):
                # Save previous chunk if it exists and is large enough
                if current_chunk and len('\n'.join(current_chunk)) > 100:
                    chunks.append({
                        'content': '\n'.join(current_chunk),
                        'start_line': current_chunk_start_line,
                        'end_line': i - 1,
                        'file_path': file_path
                    })
                    current_chunk = []
                    current_chunk_start_line = i
            
            current_chunk.append(line)
            
            # If chunk is too large, split it
            if len('\n'.join(current_chunk)) > self.max_chunk_size:
                chunks.append({
                    'content': '\n'.join(current_chunk),
                    'start_line': current_chunk_start_line,
                    'end_line': i,
                    'file_path': file_path
                })
                # Keep overlap
                overlap_lines = int(self.overlap / (len('\n'.join(current_chunk)) / len(current_chunk)))
                current_chunk = current_chunk[-overlap_lines:] if overlap_lines > 0 else []
                current_chunk_start_line = i - len(current_chunk) + 1
        
        # Add remaining chunk
        if current_chunk:
            chunks.append({
                'content': '\n'.join(current_chunk),
                'start_line': current_chunk_start_line,
                'end_line': len(lines),
                'file_path': file_path
            })
        
        return chunks if chunks else [{'content': content, 'start_line': 1, 'end_line': len(lines), 'file_path': file_path}]
    
    def _chunk_by_functions(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Generic chunking by detecting function-like patterns."""
        chunks = []
        lines = content.split('\n')
        current_chunk = []
        current_chunk_start_line = 1
        
        # Patterns that typically indicate function/method definitions
        function_patterns = [
            r'^\s*(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(',  # Java/C++/C#
            r'^\s*func\s+\w+',  # Go/Swift
            r'^\s*fn\s+\w+',  # Rust
            r'^\s*function\s+\w+',  # JavaScript
            r'^\s*(const|let|var)\s+\w+\s*=\s*(async)?\s*\(',  # JS arrow functions
        ]
        
        for i, line in enumerate(lines, 1):
            # Check if this line starts a new function/block
            is_function_start = any(re.match(pattern, line) for pattern in function_patterns)
            
            if is_function_start and current_chunk and len('\n'.join(current_chunk)) > 100:
                chunks.append({
                    'content': '\n'.join(current_chunk),
                    'start_line': current_chunk_start_line,
                    'end_line': i - 1,
                    'file_path': file_path
                })
                current_chunk = []
                current_chunk_start_line = i
            
            current_chunk.append(line)
            
            # If chunk is too large, split it
            if len('\n'.join(current_chunk)) > self.max_chunk_size:
                chunks.append({
                    'content': '\n'.join(current_chunk),
                    'start_line': current_chunk_start_line,
                    'end_line': i,
                    'file_path': file_path
                })
                overlap_lines = max(1, int(self.overlap / 50))
                current_chunk = current_chunk[-overlap_lines:]
                current_chunk_start_line = i - len(current_chunk) + 1
        
        # Add remaining chunk
        if current_chunk:
            chunks.append({
                'content': '\n'.join(current_chunk),
                'start_line': current_chunk_start_line,
                'end_line': len(lines),
                'file_path': file_path
            })
        
        return chunks if chunks else [{'content': content, 'start_line': 1, 'end_line': len(lines), 'file_path': file_path}]
    
    @staticmethod
    def chunk_text(text: str, max_size: int = 2000, overlap: int = 200) -> List[str]:
        """
        Simple text chunking with overlap for non-code content.
        
        Args:
            text: Text to chunk
            max_size: Maximum characters per chunk
            overlap: Number of characters to overlap
            
        Returns:
            List of text chunks
        """
        if len(text) <= max_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + max_size
            
            # Try to break at a sentence or paragraph boundary
            if end < len(text):
                # Look for paragraph break
                last_para = text.rfind('\n\n', start, end)
                if last_para > start:
                    end = last_para
                else:
                    # Look for sentence break
                    last_period = max(
                        text.rfind('. ', start, end),
                        text.rfind('.\n', start, end),
                        text.rfind('! ', start, end),
                        text.rfind('? ', start, end)
                    )
                    if last_period > start:
                        end = last_period + 1
            
            chunks.append(text[start:end].strip())
            start = end - overlap if end < len(text) else end
        
        return chunks

