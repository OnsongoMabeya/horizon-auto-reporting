import React from 'react';
import { 
  Box,
  Button,
  Typography,
  Paper
} from '@mui/material';
import { Edit } from '@mui/icons-material';

const StationCard = React.memo(({ 
  baseStation,
  narration,
  onEditClick,
  onGenerateAnalysis,
  isGenerating,
  chartRefs
}) => {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{baseStation}</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            onClick={onGenerateAnalysis}
            size="small"
            variant="contained"
            color="primary"
            disabled={isGenerating}
          >
            {isGenerating ? 'GENERATING...' : 'GENERATE AUTO ANALYSIS'}
          </Button>
          <Button
            startIcon={<Edit />}
            onClick={onEditClick}
            size="small"
          >
            EDIT NARRATION
          </Button>
        </Box>
      </Box>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>Analysis</Typography>
        <Typography
          variant="body1"
          component="div"
          sx={{ '& p': { mt: 1, mb: 1 } }}
          dangerouslySetInnerHTML={{ __html: narration || 'Click "GENERATE AUTO ANALYSIS" to analyze the data.' }}
        />
      </Box>
    </Paper>
  );
});

export default StationCard;
