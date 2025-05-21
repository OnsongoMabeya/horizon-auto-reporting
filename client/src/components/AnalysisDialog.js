import React, { useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box
} from '@mui/material';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['clean']
  ],
};

const AnalysisDialog = React.memo(({ 
  open, 
  onClose, 
  station, 
  narration, 
  onNarrationChange 
}) => {
  const quillRef = useRef(null);

  useEffect(() => {
    if (open && quillRef.current) {
      // Force Quill to update its layout after dialog opens
      setTimeout(() => {
        const editor = quillRef.current.getEditor();
        editor.focus();
      }, 100);
    }
  }, [open]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '60vh',
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle>
        Edit Analysis for {station}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, '& .quill': { height: 'calc(100% - 50px)' } }}>
          <ReactQuill
            ref={quillRef}
            value={narration || ''}
            onChange={onNarrationChange}
            theme="snow"
            modules={modules}
            style={{ height: '300px' }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
});

AnalysisDialog.displayName = 'AnalysisDialog';

export default AnalysisDialog;
