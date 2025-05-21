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
  chartRefs
}) => {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{baseStation}</Typography>
        <Button
          startIcon={<Edit />}
          onClick={onEditClick}
          size="small"
        >
          EDIT NARRATION
        </Button>
      </Box>

      {/* <Stack spacing={3} sx={{ mb: 3 }}>
        {chartRefs[baseStation] && [
          { metric: 'Voltage', label: 'Voltage Readings', color: 'rgb(33, 150, 243)' },
          { metric: 'Current', label: 'Current Readings', color: 'rgb(244, 67, 54)' },
          { metric: 'Power', label: 'Power Readings', color: 'rgb(76, 175, 80)' }
        ].map(({ metric, label, color }) => (
          <Box key={metric}>
            <Typography variant="h6" gutterBottom sx={{ color: color }}>
              {label}
            </Typography>
            <Box sx={{
              height: 300,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
            }}>
              <canvas ref={chartRefs[baseStation][metric]} style={{ width: '100%', height: '100%' }} />
            </Box>
          </Box>
        ))}
      </Stack> */}

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
