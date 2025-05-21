import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import CircularProgress from '@mui/material/CircularProgress';
import { createChart, getMetricInsights } from '../utils/chartUtils';
import { generatePDF } from '../utils/pdfUtils';
import StationCard from './StationCard';
import AnalysisDialog from './AnalysisDialog';

export const ReportEditor = ({ groupedStations, stationData }) => {
  const [narrations, setNarrations] = useState({});
  const [generating, setGenerating] = useState(false);
  const [editingStation, setEditingStation] = useState(null);
  const [chartsLoaded, setChartsLoaded] = useState(false);
  const chartRefsLocal = useRef({});
  const containerRef = useRef(null);
  
  // Memoize station data processing
  const processedData = React.useMemo(() => {
    if (!stationData) return {};
    const processed = Object.entries(stationData).reduce((acc, [station, data]) => {
      if (!data || data.length === 0) return acc;
      acc[station] = {
        timestamps: data.map(d => new Date(d.time).toLocaleString()),
        forwardPower: data.map(d => d.Analog1Value),
        reflectedPower: data.map(d => d.Analog2Value),
        temperature: data.map(d => d.Analog3Value),
        // Calculate VSWR from forward and reflected power
        vswr: data.map(d => {
          const forward = d.Analog1Value;
          const reflected = d.Analog2Value;
          if (forward <= 0 || reflected <= 0) return 0;
          const sqrtRatio = Math.sqrt(reflected / forward);
          return (1 + sqrtRatio) / (1 - sqrtRatio);
        }),
        // Calculate return loss
        returnLoss: data.map(d => {
          const forward = d.Analog1Value;
          const reflected = d.Analog2Value;
          if (forward <= 0 || reflected <= 0) return 0;
          return -10 * Math.log10(reflected / forward);
        })
      };
      return acc;
    }, {});
    console.log('Processed data with RF metrics:', processed);
    return processed;
  }, [stationData]);

  // Load saved narrations from localStorage
  useEffect(() => {
    const savedNarrations = localStorage.getItem('reportNarrations');
    if (savedNarrations) {
      setNarrations(JSON.parse(savedNarrations));
    }
  }, []);

  // Initialize chart refs
  useEffect(() => {
    if (!groupedStations) return;

    const newChartRefs = {};
    Object.entries(groupedStations).forEach(([, baseStations]) => {
      baseStations.forEach(baseStation => {
        newChartRefs[baseStation] = {
          'Forward Power': React.createRef(),
          'Reflected Power': React.createRef(),
          'VSWR': React.createRef(),
          'Return Loss': React.createRef(),
          'Temperature': React.createRef()
        };
      });
    });

    chartRefsLocal.current = newChartRefs;
  }, [groupedStations]);

  // Create and update charts
  useEffect(() => {
    if (!groupedStations || !stationData || !processedData || !chartRefsLocal.current) {
      console.log('Missing required data for chart initialization:', {
        hasGroupedStations: !!groupedStations,
        hasStationData: !!stationData,
        hasProcessedData: !!processedData,
        hasChartRefs: !!chartRefsLocal.current
      });
      return;
    }

    const charts = [];
    let allChartsCreated = true;

    // Create charts
    Object.entries(groupedStations).forEach(([, baseStations]) => {
      baseStations.forEach(baseStation => {
        if (!processedData[baseStation]) {
          console.log(`Missing processed data for station: ${baseStation}`);
          allChartsCreated = false;
          return;
        }

        const refs = chartRefsLocal.current[baseStation];

        const { timestamps, forwardPower, reflectedPower, vswr, returnLoss, temperature } = processedData[baseStation];

        // Wait for DOM elements to be available
        if (refs['Forward Power'].current && 
            refs['Reflected Power'].current && 
            refs['VSWR'].current && 
            refs['Return Loss'].current && 
            refs['Temperature'].current) {
          
          const data = processedData[baseStation];
          
          // Create charts
          const forwardPowerChart = createChart(
            refs['Forward Power'].current,
            'Forward Power (W)',
            data.timestamps,
            data.forwardPower,
            'blue'
          );

          const reflectedPowerChart = createChart(
            refs['Reflected Power'].current,
            'Reflected Power (W)',
            data.timestamps,
            data.reflectedPower,
            'red'
          );

          const vswrChart = createChart(
            refs['VSWR'].current,
            'VSWR',
            data.timestamps,
            data.vswr,
            'orange'
          );

          const returnLossChart = createChart(
            refs['Return Loss'].current,
            'Return Loss (dB)',
            data.timestamps,
            data.returnLoss,
            'purple'
          );

          const temperatureChart = createChart(
            refs['Temperature'].current,
            'Temperature (\u00b0C)',
            data.timestamps,
            data.temperature,
            'green'
          );

          charts.push(forwardPowerChart, reflectedPowerChart, vswrChart, returnLossChart, temperatureChart);
        }
      });
    });

    setChartsLoaded(allChartsCreated);

    // If all charts are created and we have data, generate initial analysis
    if (allChartsCreated && !generating) {
      Object.entries(groupedStations).forEach(([, baseStations]) => {
        baseStations.forEach(baseStation => {
          if (processedData[baseStation] && !narrations[baseStation]) {
            generateAutoNarration(baseStation);
          }
        });
      });
    }

    // Cleanup function to destroy charts
    return () => {
      charts.forEach(chart => {
        if (chart) chart.destroy();
      });
    };
  }, [groupedStations, stationData]);

  // Save narrations to localStorage when they change
  const generateAutoNarration = useCallback(async (baseStation) => {
    if (!chartRefsLocal.current || !chartRefsLocal.current[baseStation]) {
      console.log('Chart refs not ready for', baseStation);
      return;
    }
    // Debug logs
    console.log('Attempting analysis for station:', baseStation, {
      chartRefs: chartRefs?.[baseStation],
      processedData: processedData?.[baseStation],
      stationData: stationData?.[baseStation],
      allProcessedData: processedData
    });

    if (!chartRefs?.[baseStation] || !processedData?.[baseStation] || !stationData?.[baseStation]) {
      console.warn('Missing required data for analysis:', { 
        hasChartRefs: !!chartRefs?.[baseStation],
        hasProcessedData: !!processedData?.[baseStation],
        hasStationData: !!stationData?.[baseStation]
      });
      return;
    }
    
    setGenerating(true);
    
    try {
      let voltageImage = '', currentImage = '', powerImage = '';
      
      if (chartRefs[baseStation]['Voltage']) {
        voltageImage = chartRefs[baseStation]['Voltage'].toDataURL('image/png');
      }
      if (chartRefs[baseStation]['Current']) {
        currentImage = chartRefs[baseStation]['Current'].toDataURL('image/png');
      }
      if (chartRefs[baseStation]['Power']) {
        powerImage = chartRefs[baseStation]['Power'].toDataURL('image/png');
      }

      // Log the data being sent
      console.log('Sending data for analysis:', {
        baseStation,
        data: processedData[baseStation],
        imageCount: {
          forwardPower: forwardPowerImage ? 1 : 0,
          reflectedPower: reflectedPowerImage ? 1 : 0,
          vswr: vswrImage ? 1 : 0,
          returnLoss: returnLossImage ? 1 : 0,
          temperature: temperatureImage ? 1 : 0
        }
      });

      const API_BASE_URL = `http://${window.location.hostname}:5000`;
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseStation,
          data: processedData[baseStation],
          images: { 
            forwardPowerImage, 
            reflectedPowerImage, 
            vswrImage, 
            returnLossImage, 
            temperatureImage 
          }
        })
      });

      if (!response.ok) throw new Error('Analysis request failed');
      
      const analysis = await response.json();
      const newNarrations = {
        ...narrations,
        [baseStation]: analysis.narration
      };
      setNarrations(newNarrations);
      
      // Save to localStorage
      localStorage.setItem('reportNarrations', JSON.stringify(newNarrations));
      
      setGenerating(false);
    } catch (err) {
      console.error('Error generating narration:', err);
    }
  }, [chartRefsLocal.current, processedData]); // Include processedData in dependencies

  useEffect(() => {
    if (chartRefsLocal.current && Object.keys(chartRefsLocal.current).length > 0) {
      Object.keys(chartRefsLocal.current).forEach(baseStation => {
        generateAutoNarration(baseStation);
      });
    }
  }, [chartRefsLocal.current, generateAutoNarration]);

  const handleNarrationChange = (station, content) => {
    setNarrations(prev => ({
      ...prev,
      [station]: content
    }));
  };

  const generateAutoNarrations = async () => {
    setGenerating(true);
    try {
      const newNarrations = {};
      
      Object.entries(groupedStations).forEach(([, baseStations]) => {
        baseStations.forEach(baseStation => {
          const data = processedData[baseStation];
          if (!data) return;

          // Get insights for each metric
          const forwardPowerInsights = getMetricInsights(
            data.forwardPower,
            data.timestamps
          );
          const reflectedPowerInsights = getMetricInsights(
            data.reflectedPower,
            data.timestamps
          );
          const vswrInsights = getMetricInsights(
            data.vswr,
            data.timestamps
          );
          const returnLossInsights = getMetricInsights(
            data.returnLoss,
            data.timestamps
          );
          const temperatureInsights = getMetricInsights(
            data.temperature,
            data.timestamps
          );

          // Generate analysis text
          newNarrations[baseStation] = `
            <div class="rf-analysis">
              <h4>RF System Analysis for ${baseStation}</h4>
              
              <div class="analysis-section">
                <h4>Forward Power Analysis:</h4>
                <p>Average: ${forwardPowerInsights.average.toFixed(2)}W</p>
                <p>Range: ${forwardPowerInsights.min.toFixed(2)}W to ${forwardPowerInsights.max.toFixed(2)}W</p>
                <p>Trend: ${forwardPowerInsights.trend}</p>
              </div>

              <div class="analysis-section">
                <h4>Reflected Power Analysis:</h4>
                <p>Average: ${reflectedPowerInsights.average.toFixed(2)}W</p>
                <p>Range: ${reflectedPowerInsights.min.toFixed(2)}W to ${reflectedPowerInsights.max.toFixed(2)}W</p>
                <p>Trend: ${reflectedPowerInsights.trend}</p>
              </div>

              <div class="analysis-section">
                <h4>VSWR Analysis:</h4>
                <p>Average: ${vswrInsights.average.toFixed(2)}</p>
                <p>Range: ${vswrInsights.min.toFixed(2)} to ${vswrInsights.max.toFixed(2)}</p>
                <p>Trend: ${vswrInsights.trend}</p>
              </div>

              <div class="analysis-section">
                <h4>Return Loss Analysis:</h4>
                <p>Average: ${returnLossInsights.average.toFixed(2)}dB</p>
                <p>Range: ${returnLossInsights.min.toFixed(2)}dB to ${returnLossInsights.max.toFixed(2)}dB</p>
                <p>Trend: ${returnLossInsights.trend}</p>
              </div>

              <div class="analysis-section">
                <h4>Temperature Analysis:</h4>
                <p>Average: ${temperatureInsights.average.toFixed(2)}°C</p>
                <p>Range: ${temperatureInsights.min.toFixed(2)}°C to ${temperatureInsights.max.toFixed(2)}°C</p>
                <p>Trend: ${temperatureInsights.trend}</p>
              </div>
            </div>
          `;
            
            `System Health Assessment:\n` +
            `${vswrInsights.average > 1.5 ? '⚠️ High VSWR detected. Check antenna system.' : '✅ VSWR within acceptable range.'}\n` +
            `${returnLossInsights.average < -20 ? '✅ Good impedance matching.' : '⚠️ Poor return loss. Check RF system.'}\n` +
            `${temperatureInsights.max > 50 ? '⚠️ High temperature detected. Check cooling system.' : '✅ Temperature within normal range.'}`;

          // Get chart images
          let forwardPowerImage = '', reflectedPowerImage = '', vswrImage = '', returnLossImage = '', temperatureImage = '';
          
          try {
            if (chartRefs?.[baseStation]) {
              forwardPowerImage = chartRefs[baseStation]['Forward Power'].current?.toDataURL() || '';
              reflectedPowerImage = chartRefs[baseStation]['Reflected Power'].current?.toDataURL() || '';
              vswrImage = chartRefs[baseStation]['VSWR'].current?.toDataURL() || '';
              returnLossImage = chartRefs[baseStation]['Return Loss'].current?.toDataURL() || '';
              temperatureImage = chartRefs[baseStation]['Temperature'].current?.toDataURL() || '';
            }
          } catch (err) {
            console.error('Error capturing chart images:', err);
          }

          newNarrations[baseStation] = `
            <div class="rf-analysis">
              <h4>RF System Analysis for ${baseStation}</h4>
              
              <div class="analysis-section">
                <h4>Forward Power Analysis:</h4>
                <img src="${forwardPowerImage}" alt="Forward Power Chart" style="width: 100%; margin-bottom: 15px;" />
                <p>Maximum: ${forwardPowerInsights.max.toFixed(2)}W at ${forwardPowerInsights.maxTime}</p>
                <p>Minimum: ${forwardPowerInsights.min.toFixed(2)}W at ${forwardPowerInsights.minTime}</p>
                <p>Average: ${forwardPowerInsights.average.toFixed(2)}W</p>
              </div>

              <div class="analysis-section">
                <h4>Reflected Power Analysis:</h4>
                <img src="${reflectedPowerImage}" alt="Reflected Power Chart" style="width: 100%; margin-bottom: 15px;" />
                <p>Maximum: ${reflectedPowerInsights.max.toFixed(2)}W at ${reflectedPowerInsights.maxTime}</p>
                <p>Minimum: ${reflectedPowerInsights.min.toFixed(2)}W at ${reflectedPowerInsights.minTime}</p>
                <p>Average: ${reflectedPowerInsights.average.toFixed(2)}W</p>
              </div>

              <div class="analysis-section">
                <h4>VSWR Analysis:</h4>
                <img src="${vswrImage}" alt="VSWR Chart" style="width: 100%; margin-bottom: 15px;" />
                <p>Maximum: ${vswrInsights.max.toFixed(2)} at ${vswrInsights.maxTime}</p>
                <p>Minimum: ${vswrInsights.min.toFixed(2)} at ${vswrInsights.minTime}</p>
                <p>Average: ${vswrInsights.average.toFixed(2)}</p>
              </div>

              <div class="analysis-section">
                <h4>Return Loss Analysis:</h4>
                <img src="${returnLossImage}" alt="Return Loss Chart" style="width: 100%; margin-bottom: 15px;" />
                <p>Maximum: ${returnLossInsights.max.toFixed(2)}dB at ${returnLossInsights.maxTime}</p>
                <p>Minimum: ${returnLossInsights.min.toFixed(2)}dB at ${returnLossInsights.minTime}</p>
                <p>Average: ${returnLossInsights.average.toFixed(2)}dB</p>
              </div>

              <div class="analysis-section">
                <h4>Temperature Analysis:</h4>
                <img src="${temperatureImage}" alt="Temperature Chart" style="width: 100%; margin-bottom: 15px;" />
                <p>Maximum: ${temperatureInsights.max.toFixed(2)}°C at ${temperatureInsights.maxTime}</p>
                <p>Minimum: ${temperatureInsights.min.toFixed(2)}°C at ${temperatureInsights.minTime}</p>
                <p>Average: ${temperatureInsights.average.toFixed(2)}°C</p>
              </div>

              <div class="health-assessment">
                <h4>System Health Assessment:</h4>
                <p>${vswrInsights.average > 1.5 ? '⚠️ High VSWR detected. Check antenna system.' : '✅ VSWR within acceptable range.'}</p>
                <p>${returnLossInsights.average < -20 ? '✅ Good impedance matching.' : '⚠️ Poor return loss. Check RF system.'}</p>
                <p>${temperatureInsights.max > 50 ? '⚠️ High temperature detected. Check cooling system.' : '✅ Temperature within normal range.'}</p>
              </div>
            </div>
          `;
        });
      });

      setNarrations(newNarrations);
    } catch (error) {
      console.error('Error generating narrations:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const pdf = await generatePDF(containerRef, narrations, chartRefsLocal.current);
      pdf.save(`horizon_auto_report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }} ref={containerRef}>
      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={generateAutoNarrations}
          disabled={generating || !chartsLoaded}
          startIcon={generating ? <CircularProgress size={20} /> : null}
        >
          GENERATE AUTO ANALYSIS
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleGeneratePDF}
          disabled={generating}
          startIcon={<PictureAsPdf />}
        >
          GENERATE COMBINED PDF REPORT
        </Button>
      </Box>

      {Object.entries(groupedStations).map(([nodeName, baseStations]) => (
        <Box key={nodeName} sx={{ mb: 4 }}>
          <Typography variant="h5" gutterBottom>
            {nodeName}
          </Typography>

          {baseStations.map((baseStation) => (
            <StationCard
              key={baseStation}
              baseStation={baseStation}
              narration={narrations[baseStation]}
              onEditClick={() => setEditingStation(baseStation)}
              chartRefs={chartRefsLocal.current}
            />
          ))}
        </Box>
      ))}

      <AnalysisDialog
        open={!!editingStation}
        onClose={() => setEditingStation(null)}
        station={editingStation}
        narration={narrations[editingStation]}
        onNarrationChange={(content) => handleNarrationChange(editingStation, content)}
      />
    </Box>
  );
};

export default ReportEditor;
