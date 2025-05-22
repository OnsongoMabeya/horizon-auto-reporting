import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import CircularProgress from '@mui/material/CircularProgress';
import { createChart, getMetricInsights } from '../utils/chartUtils';
import { generatePDF } from '../utils/pdfUtils';
import StationCard from './StationCard';
import AnalysisDialog from './AnalysisDialog';

// Constants
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const ReportEditor = ({ groupedStations, stationData }) => {
  const [narrations, setNarrations] = useState({});
  const [generating, setGenerating] = useState(false);
  const [editingStation, setEditingStation] = useState(null);

  const chartRefsLocal = useRef({});
  const containerRef = useRef(null);
  
  // Helper functions for data processing
  const calculateVSWR = React.useCallback((forward, reflected) => {
    if (forward <= 0) return 1;
    const sqrtRho = Math.sqrt(reflected / forward);
    return (1 + sqrtRho) / (1 - sqrtRho);
  }, []);

  const calculateReturnLoss = React.useCallback((forward, reflected) => {
    if (forward <= 0 || reflected <= 0) return 0;
    return -20 * Math.log10(Math.sqrt(reflected / forward));
  }, []);

  // Process data in chunks to prevent memory issues
  const processDataChunk = React.useCallback((data) => {
    if (!data) {
      console.warn('No data received');
      return null;
    }

    if (!Array.isArray(data)) {
      console.warn('Invalid data format received - expected array');
      return null;
    }
    
    if (data.length === 0) {
      console.warn('Empty data array received');
      return null;
    }

    const chunkSize = 100; // Process 100 data points at a time
    const result = {
      timestamps: [],
      forwardPower: [],
      reflectedPower: [],
      temperature: [],
      voltage: [],
      current: [],
      power: [],
      vswr: [],
      returnLoss: []
    };

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      chunk.forEach(d => {
        result.timestamps.push(new Date(d.Timestamp).toLocaleString());
        const forward = d['Forward Power'] || 0;
        const reflected = d['Reflected Power'] || 0;
        
        result.forwardPower.push(forward);
        result.reflectedPower.push(reflected);
        result.temperature.push(d.Temperature || 0);
        result.voltage.push(d.Voltage || 0);
        result.current.push(d.Current || 0);
        result.power.push(d.Power || 0);
        result.vswr.push(calculateVSWR(forward, reflected));
        result.returnLoss.push(calculateReturnLoss(forward, reflected));
      });
    }

    return result;
  }, [calculateVSWR, calculateReturnLoss]);

  // Memoize station data processing with progress tracking
  const processedData = React.useMemo(() => {
    if (!stationData) {
      console.debug('No station data available');
      return {};
    }

    if (typeof stationData !== 'object') {
      console.error('Invalid station data format');
      return {};
    }

    const processed = {};
    let processedCount = 0;
    const totalStations = Object.keys(stationData).length;

    for (const [station, stationDataObj] of Object.entries(stationData)) {
      const data = stationDataObj && Object.values(stationDataObj)[0];
      const result = processDataChunk(data);
      if (result) processed[station] = result;

      processedCount++;
      const progress = Math.round((processedCount / totalStations) * 100);
      console.debug(`Processing station data: ${progress}% complete`);
    }

    console.debug('Completed processing station data');
    return processed;
  }, [stationData, processDataChunk]);

  // Initialize chart refs and load saved narrations
  useEffect(() => {
    if (!groupedStations) return;

    // Initialize chart refs
    const newChartRefs = {};
    Object.entries(groupedStations).forEach(([station]) => {
      newChartRefs[station] = {
        'Forward Power': React.createRef(),
        'Reflected Power': React.createRef(),
        'VSWR': React.createRef(),
        'Return Loss': React.createRef(),
        'Temperature': React.createRef(),
        'Voltage': React.createRef(),
        'Current': React.createRef(),
        'Power': React.createRef()
      };
    });

    chartRefsLocal.current = newChartRefs;

    // Load saved narrations
    const savedNarrations = localStorage.getItem('reportNarrations');
    if (savedNarrations) {
      const parsedNarrations = JSON.parse(savedNarrations);
      // Only load narrations for current stations
      const filteredNarrations = Object.entries(parsedNarrations)
        .filter(([station]) => groupedStations[station])
        .reduce((acc, [station, narration]) => {
          acc[station] = narration;
          return acc;
        }, {});
      setNarrations(filteredNarrations);
    }
  }, [groupedStations]);

  // Generate auto narration for a station
  const generateAutoNarration = useCallback(async (station) => {
    if (!chartRefsLocal.current) {
      console.error('Chart refs not ready for', station);
      return;
    }

    if (generating) {
      console.log('Already generating analysis for another station');
      return;
    }

    setGenerating(true);

    try {
      const data = processedData[station];
      if (!data || !data.timestamps || data.timestamps.length === 0) {
        setNarrations(prev => ({
          ...prev,
          [station]: `No data available for ${station} in the selected time period.`
        }));
        return;
      }

      // Calculate insights
      const forwardPowerInsights = getMetricInsights(data.timestamps, data.forwardPower);
      const reflectedPowerInsights = getMetricInsights(data.timestamps, data.reflectedPower);
      const vswrInsights = getMetricInsights(data.timestamps, data.vswr);
      const returnLossInsights = getMetricInsights(data.timestamps, data.returnLoss);
      const temperatureInsights = getMetricInsights(data.timestamps, data.temperature);
      const voltageInsights = getMetricInsights(data.timestamps, data.voltage);
      const currentInsights = getMetricInsights(data.timestamps, data.current);
      const powerInsights = getMetricInsights(data.timestamps, data.power);

      // Generate narration
      const narration = `
        ## RF System Analysis for ${station}

        ### Forward Power
        - Maximum: ${forwardPowerInsights.max.toFixed(2)}W at ${forwardPowerInsights.maxTime}
        - Minimum: ${forwardPowerInsights.min.toFixed(2)}W at ${forwardPowerInsights.minTime}
        - Average: ${forwardPowerInsights.average.toFixed(2)}W
        - Trend: ${forwardPowerInsights.trend}

        ### Reflected Power
        - Maximum: ${reflectedPowerInsights.max.toFixed(2)}W at ${reflectedPowerInsights.maxTime}
        - Minimum: ${reflectedPowerInsights.min.toFixed(2)}W at ${reflectedPowerInsights.minTime}
        - Average: ${reflectedPowerInsights.average.toFixed(2)}W
        - Trend: ${reflectedPowerInsights.trend}

        ### VSWR
        - Maximum: ${vswrInsights.max.toFixed(2)} at ${vswrInsights.maxTime}
        - Minimum: ${vswrInsights.min.toFixed(2)} at ${vswrInsights.minTime}
        - Average: ${vswrInsights.average.toFixed(2)}
        - Trend: ${vswrInsights.trend}

        ### Return Loss
        - Maximum: ${returnLossInsights.max.toFixed(2)}dB at ${returnLossInsights.maxTime}
        - Minimum: ${returnLossInsights.min.toFixed(2)}dB at ${returnLossInsights.minTime}
        - Average: ${returnLossInsights.average.toFixed(2)}dB
        - Trend: ${returnLossInsights.trend}

        ### Temperature
        - Maximum: ${temperatureInsights.max.toFixed(2)}°C at ${temperatureInsights.maxTime}
        - Minimum: ${temperatureInsights.min.toFixed(2)}°C at ${temperatureInsights.minTime}
        - Average: ${temperatureInsights.average.toFixed(2)}°C
        - Trend: ${temperatureInsights.trend}

        ### Voltage
        - Maximum: ${voltageInsights.max.toFixed(2)}V at ${voltageInsights.maxTime}
        - Minimum: ${voltageInsights.min.toFixed(2)}V at ${voltageInsights.minTime}
        - Average: ${voltageInsights.average.toFixed(2)}V
        - Trend: ${voltageInsights.trend}

        ### Current
        - Maximum: ${currentInsights.max.toFixed(2)}A at ${currentInsights.maxTime}
        - Minimum: ${currentInsights.min.toFixed(2)}A at ${currentInsights.minTime}
        - Average: ${currentInsights.average.toFixed(2)}A
        - Trend: ${currentInsights.trend}

        ### Power
        - Maximum: ${powerInsights.max.toFixed(2)}W at ${powerInsights.maxTime}
        - Minimum: ${powerInsights.min.toFixed(2)}W at ${powerInsights.minTime}
        - Average: ${powerInsights.average.toFixed(2)}W
        - Trend: ${powerInsights.trend}

        ### System Health Assessment
        ${vswrInsights.average > 1.5 ? '⚠️ High VSWR detected. Check antenna system.' : '✅ VSWR within acceptable range.'}
        ${returnLossInsights.average < -20 ? '✅ Good impedance matching.' : '⚠️ Poor return loss. Check RF system.'}
        ${temperatureInsights.max > 50 ? '⚠️ High temperature detected. Check cooling system.' : '✅ Temperature within normal range.'}
        ${voltageInsights.average < 200 ? '⚠️ Low voltage detected. Check power supply.' : '✅ Voltage within normal range.'}
        ${currentInsights.average > 10 ? '⚠️ High current detected. Check for shorts.' : '✅ Current within normal range.'}
      `;

      setNarrations(prev => ({
        ...prev,
        [station]: narration
      }));

    } catch (error) {
      console.error('Error generating narration:', error);
      throw error; // Re-throw to be handled by caller
    } finally {
      setGenerating(false);
    }
  }, [processedData, generating]);

  // Memoized chart metrics configuration
  const chartMetrics = React.useMemo(() => [
    { name: 'Forward Power', unit: 'W', color: 'blue' },
    { name: 'Reflected Power', unit: 'W', color: 'red' },
    { name: 'VSWR', unit: '', color: 'orange' },
    { name: 'Return Loss', unit: 'dB', color: 'purple' },
    { name: 'Temperature', unit: '°C', color: 'green' },
    { name: 'Voltage', unit: 'V', color: 'brown' },
    { name: 'Current', unit: 'A', color: 'orange' },
    { name: 'Power', unit: 'W', color: 'purple' }
  ], []);

  // Create and update charts
  useEffect(() => {
    if (!groupedStations || !stationData || !processedData || !chartRefsLocal.current) {
      console.error('Missing required data for chart initialization:', {
        hasGroupedStations: !!groupedStations,
        hasStationData: !!stationData,
        hasProcessedData: !!processedData,
        hasChartRefs: !!chartRefsLocal.current
      });
      return;
    }

    const charts = [];
    const pendingNarrations = [];

    // Create charts with error boundary
    const createMetricChart = (refs, data, metric, unit, color) => {
      if (!refs?.[metric]?.current) {
        console.error(`Missing chart ref for ${metric}`);
        return false;
      }

      try {
        const chart = createChart(
          refs[metric],
          `${metric} (${unit})`,
          data.timestamps,
          data[metric.toLowerCase().replace(' ', '')],
          color
        );
        charts.push(chart);
        return true;
      } catch (error) {
        console.error(`Error creating chart for ${metric}:`, error);
        return false;
      }
    };

    // Process stations in batches to prevent memory issues
    const batchSize = 5;
    const stations = Object.keys(groupedStations);
    
    for (let i = 0; i < stations.length; i += batchSize) {
      const batch = stations.slice(i, i + batchSize);
      
      batch.forEach(station => {
        const refs = chartRefsLocal.current[station];
        const data = processedData[station];

        if (!data) {
          console.error(`Missing processed data for station: ${station}`);
          return;
        }

        if (refs && data) {
          const allChartsCreated = chartMetrics.every(metric =>
            createMetricChart(refs, data, metric.name, metric.unit, metric.color)
          );

          // Queue narration generation if charts are created and no narration exists
          if (allChartsCreated && !narrations[station]) {
            pendingNarrations.push(station);
          }
        }
      });
    }

    // Generate narrations for all stations that need them
    if (pendingNarrations.length > 0 && !generating) {
      (async () => {
        for (const station of pendingNarrations) {
          try {
            await generateAutoNarration(station);
          } catch (error) {
            console.error(`Failed to generate narration for ${station}:`, error);
          }
        }
      })();
    }

    // Cleanup function to destroy charts
    return () => {
      charts.forEach(chart => {
        if (chart?.destroy) chart.destroy();
      });
    };
  }, [groupedStations, stationData, processedData, generating, narrations, generateAutoNarration, chartMetrics]);

  // Save narrations to localStorage when they change
  useEffect(() => {
    localStorage.setItem('reportNarrations', JSON.stringify(narrations));
  }, [narrations]);

  useEffect(() => {
    if (chartRefsLocal.current && Object.keys(chartRefsLocal.current).length > 0) {
      Object.keys(chartRefsLocal.current).forEach(baseStation => {
        generateAutoNarration(baseStation);
      });
    }
  }, [chartRefsLocal, generateAutoNarration]);

  const handleNarrationChange = (station, content) => {
    setNarrations(prev => ({
      ...prev,
      [station]: content
    }));
  };

  // Error state management
  const [error, setError] = useState(null);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleError = useCallback((error, context) => {
    console.error(`Error in ${context}:`, error);
    setError({
      context,
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    });
  }, []);

  const handleGeneratePDF = async () => {
    if (generating) {
      handleError(new Error('Already generating a report'), 'PDF Generation');
      return;
    }

    setGenerating(true);
    try {
      if (!containerRef.current) {
        throw new Error('Container reference not available');
      }

      const pdf = await generatePDF(containerRef, narrations, chartRefsLocal.current);
      const filename = `horizon_auto_report_${new Date().toISOString().split('T')[0]}.pdf`;
      
      try {
        await pdf.save(filename);
      } catch (saveError) {
        throw new Error(`Failed to save PDF: ${saveError.message}`);
      }
    } catch (error) {
      handleError(error, 'PDF Generation');
    } finally {
      setGenerating(false);
    }
  };

  // Memoize sorted and filtered stations for better performance
  const sortedStations = React.useMemo(() => {
    if (!groupedStations) return [];
    return Object.entries(groupedStations)
      .filter(([station]) => processedData[station])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [groupedStations, processedData]);

  return (
    <Box ref={containerRef}>
      <Box sx={{
        mb: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2
      }}>
        <Typography variant="h4">
          Station Reports
        </Typography>

        <Button
          startIcon={<PictureAsPdf />}
          variant="contained"
          onClick={handleGeneratePDF}
          disabled={generating}
        >
          {generating ? (
            <>
              <CircularProgress size={24} sx={{ mr: 1 }} />
              Generating PDF...
            </>
          ) : (
            'Generate PDF Report'
          )}
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 1,
            bgcolor: 'error.light',
            color: 'error.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography>
            {error.context}: {error.message}
          </Typography>
          <Button
            size="small"
            sx={{ color: 'inherit' }}
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </Box>
      )}

      {/* Station Cards with virtualization for better performance */}
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        overflow: 'auto'
      }}>
        {sortedStations.map(([station]) => (
          <StationCard
            key={station}
            baseStation={station}
            narration={narrations[station]}
            onEditClick={() => setEditingStation(station)}
            onGenerateAnalysis={() => generateAutoNarration(station)}
            isGenerating={generating && editingStation === station}
            chartRefs={chartRefsLocal.current[station]}
            error={error?.context === station ? error.message : null}
          />
        ))}

        {sortedStations.length === 0 && (
          <Typography variant="body1" sx={{ textAlign: 'center', py: 4 }}>
            No stations available. Please check your data and try again.
          </Typography>
        )}
      </Box>

      <AnalysisDialog
        open={!!editingStation}
        onClose={() => setEditingStation(null)}
        station={editingStation}
        narration={editingStation ? narrations[editingStation] : ''}
        onNarrationChange={handleNarrationChange}
      />
    </Box>
  );
};

export default ReportEditor;
