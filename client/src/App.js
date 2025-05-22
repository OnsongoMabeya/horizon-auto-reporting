import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Chart } from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { enUS } from 'date-fns/locale';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  Container,
  Grid,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  Box,
  Stack,
  Tab,
  AppBar,
  Toolbar,
  Card,
  CardContent,
  Chip
} from '@mui/material';
import { TabContext, TabList, TabPanel } from '@mui/lab';
import ReportEditor from './components/ReportEditor';

// Constants
const NODE_NAMES = ['Aviation FM', 'Emoo FM', 'Genset02', 'Kameme FM', 'MediaMax1'];
const TIME_PERIODS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' }
];

// Create theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          transition: 'transform 0.2s',
          '&:hover': {
            transform: 'translateY(-4px)',
          },
        },
      },
    },
  },
});

// Helper Functions
// eslint-disable-next-line no-unused-vars
const calculateStats = (data, metric) => {
  if (!data || data.length === 0) return {};
  
  const values = data.map(d => d[metric]);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  
  return { avg, max, min };
};

const getMetricUnit = (metric) => {
  switch (metric) {
    case 'Forward Power':
    case 'Reflected Power':
    case 'Power':
      return 'W';
    case 'VSWR':
      return 'ratio';
    case 'Return Loss':
      return 'dB';
    case 'Temperature':
      return '°C';
    case 'Voltage':
      return 'V';
    case 'Current':
      return 'A';
    default:
      return '';
  }
};

// Components
// Get global time range for all charts
const getTimeRange = (data) => {
  if (!data || data.length === 0) return { min: undefined, max: undefined };
  
  const timestamps = data
    .filter(d => d && d.Timestamp)
    .map(d => new Date(d.Timestamp).getTime());

  return {
    min: new Date(Math.min(...timestamps)),
    max: new Date(Math.max(...timestamps))
  };
};

const TimeSeriesChart = ({ data, metric, color, onChartRef, globalTimeRange }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [error, setError] = useState(null);
  const unit = getMetricUnit(metric);

  useEffect(() => {
    // Early return if missing required data
    if (!data || !Array.isArray(data) || data.length === 0) {
      setError('No data available');
      return;
    }

    if (!chartRef.current) {
      setError('Chart reference not available');
      return;
    }

    try {
      // Cleanup existing chart
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }

      // Log data structure and time range for debugging
      console.log(`Processing ${metric} chart with ${data.length} data points`);
      if (globalTimeRange?.min) {
        console.log('Time range:', {
          min: globalTimeRange.min?.toISOString(),
        max: globalTimeRange.max?.toISOString(),
        dataStart: new Date(data[0].Timestamp)?.toISOString(),
        dataEnd: new Date(data[data.length - 1].Timestamp)?.toISOString()
      });
    }

    // Map metric names to data fields
    const metricToField = {
      'Forward Power': 'ForwardPower',
      'Reflected Power': 'ReflectedPower',
      'VSWR': 'VSWR',
      'Return Loss': 'ReturnLoss',
      'Temperature': 'Temperature',
      'Voltage': 'Voltage',
      'Current': 'Current',
      'Power': 'Power'
    };

    const field = metricToField[metric];
    
    // Filter data within the global time range
    const processedData = data
      .filter(d => {
        const timestamp = new Date(d.Timestamp);
        return d && 
               timestamp && 
               d[field] !== undefined && 
               d[field] !== null &&
               timestamp >= globalTimeRange.min &&
               timestamp <= globalTimeRange.max;
      })
      .map(d => ({
        x: new Date(d.Timestamp),
        y: parseFloat(d[field])
      }))
      .sort((a, b) => a.x - b.x);

    // Calculate min/max for better scaling
    const values = processedData.map(d => d.y);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;

    // Set scale padding based on data range
    const padding = range * 0.1; // 10% padding

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: `${metric} (${unit})`,
          data: processedData,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          pointRadius: 1,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: `${metric} (${unit})`,
            font: {
              size: 16,
              weight: 'bold'
            },
            color: color
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `${metric}: ${context.parsed.y.toFixed(2)} ${unit}`
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour',
              displayFormats: {
                hour: 'HH:mm',
                day: 'MMM D'
              },
              min: globalTimeRange.min,
              max: globalTimeRange.max,
              bounds: 'data'
            },
            adapters: {
              date: {
                locale: enUS
              }
            },
            grid: {
              color: 'rgba(0,0,0,0.1)'
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            beginAtZero: metric === 'VSWR' || metric === 'Return Loss',
            suggestedMin: Math.max(0, minValue - padding),
            suggestedMax: maxValue + padding,
            grid: {
              color: 'rgba(0,0,0,0.1)'
            },
            title: {
              display: true,
              text: `${metric} (${unit})`,
              color: color
            }
          }
        }
      }
    });

      // Only call onChartRef if it exists and we have a valid chart reference
      if (onChartRef && chartRef.current) {
        onChartRef(chartRef.current);
      }

      setError(null); // Clear any previous errors
    } catch (err) {
      console.error(`Error creating ${metric} chart:`, err);
      setError(`Failed to create chart: ${err.message}`);
    }

    // Cleanup function
    return () => {
      if (chartInstance.current) {
        try {
          chartInstance.current.destroy();
          chartInstance.current = null;
        } catch (err) {
          console.error(`Error cleaning up ${metric} chart:`, err);
        }
      }
    };
  }, [data, metric, color, onChartRef, globalTimeRange]);

  // If there's an error, display it
  if (error) {
    return (
      <div style={{ 
        padding: '1rem', 
        color: 'red', 
        backgroundColor: '#ffebee',
        borderRadius: '4px',
        margin: '0.5rem 0'
      }}>
        {error}
      </div>
    );
  }

  // Return the canvas for the chart
  return <canvas ref={chartRef} />;
};

const App = () => {
  const chartRefs = useRef({});
  const [selectedStation, setSelectedStation] = useState(NODE_NAMES[0]);
  const [selectedBaseStation, setSelectedBaseStation] = useState('');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('24h');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [baseStations, setBaseStations] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('1');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Chart refs for synchronizing zoom/pan
  const forwardPowerChartRef = useRef(null);
  const reflectedPowerChartRef = useRef(null);
  const vswrChartRef = useRef(null);
  const returnLossChartRef = useRef(null);
  const temperatureChartRef = useRef(null);
  const voltageChartRef = useRef(null);
  const currentChartRef = useRef(null);
  const powerChartRef = useRef(null);
  const [timeRange, setTimeRange] = useState({ min: null, max: null });

  const handleForwardPowerChartRef = useCallback((chart) => {
    forwardPowerChartRef.current = chart;
  }, []);

  const handleReflectedPowerChartRef = useCallback((chart) => {
    reflectedPowerChartRef.current = chart;
  }, []);

  const handleVSWRChartRef = useCallback((chart) => {
    vswrChartRef.current = chart;
  }, []);

  const handleReturnLossChartRef = useCallback((chart) => {
    returnLossChartRef.current = chart;
  }, []);

  const handleTemperatureChartRef = useCallback((chart) => {
    temperatureChartRef.current = chart;
  }, []);

  const handleVoltageChartRef = useCallback((chart) => {
    voltageChartRef.current = chart;
  }, []);

  const handleCurrentChartRef = useCallback((chart) => {
    currentChartRef.current = chart;
  }, []);

  const handlePowerChartRef = useCallback((chart) => {
    powerChartRef.current = chart;
  }, []);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Server configuration
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

  const fetchBaseStations = useCallback(async (station) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/base-stations/${station}`);
      setBaseStations(response.data);
      setSelectedBaseStation(response.data[0] || '');
    } catch (err) {
      console.error('Error fetching base stations:', err);
      setBaseStations([]);
      setSelectedBaseStation('');
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!selectedStation) {
        throw new Error('No station selected');
      }

      let url = `${API_BASE_URL}/api/data/${encodeURIComponent(selectedStation)}/${selectedTimePeriod}`;
      const params = new URLSearchParams();
      
      if (selectedBaseStation) {
        params.append('baseStation', selectedBaseStation);
      }
      
      if (selectedTimePeriod === 'custom' && customStartDate && customEndDate) {
        console.log('Sending custom date range:', { customStartDate, customEndDate });
        params.append('startDate', customStartDate);
        params.append('endDate', customEndDate);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      console.log('Requesting URL:', url);
      console.log('Selected time period:', selectedTimePeriod);
      console.log('Selected base station:', selectedBaseStation);
      
      try {
        const response = await axios.get(url);
        const newData = response.data;
        
        // Calculate global time range from the new data
        if (newData && newData.length > 0) {
          // Sort data by timestamp first
          newData.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
          
          // Filter out invalid timestamps and get min/max
          const validData = newData.filter(d => d && d.Timestamp);
          if (validData.length > 0) {
            const min = new Date(validData[0].Timestamp);
            const max = new Date(validData[validData.length - 1].Timestamp);
            
            console.log('New time range:', { min, max });
            setTimeRange({ min, max });
          }
        }

        setData(newData);
      } catch (err) {
        if (err.response && err.response.status === 404) {
          const details = err.response.data?.details;
          if (details && details.latestDataPoint) {
            setError(`No data available in the selected time period. Latest data point: ${new Date(details.latestDataPoint).toLocaleString()}`);
          } else {
            setError('No data available for the selected time period.');
          }
          setData([]);
          setTimeRange(null);
        } else {
          throw err; // Re-throw other errors
        }
      }
    } catch (err) {
      setError('Failed to fetch data. Please try again later.');
      console.error('Error fetching data:', err);
      setData([]);
      setTimeRange(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStation, selectedBaseStation, selectedTimePeriod, API_BASE_URL]);

  useEffect(() => {
    fetchBaseStations(selectedStation);
  }, [selectedStation, fetchBaseStations, API_BASE_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData, selectedStation, selectedBaseStation, selectedTimePeriod]);

  useEffect(() => {
    fetchBaseStations(selectedStation);
  }, [fetchBaseStations, selectedStation]);

  useEffect(() => {
    if (selectedStation && selectedBaseStation) {
      chartRefs.current[selectedStation] = {
        'Forward Power': forwardPowerChartRef,
        'Reflected Power': reflectedPowerChartRef,
        'VSWR': vswrChartRef,
        'Return Loss': returnLossChartRef,
        'Temperature': temperatureChartRef,
        'Voltage': voltageChartRef,
        'Current': currentChartRef,
        'Power': powerChartRef
      };
    }
  }, [selectedStation, selectedBaseStation]);

  const handleStationChange = (event) => {
    setSelectedStation(event.target.value);
  };

  const handleBaseStationChange = (event) => {
    setSelectedBaseStation(event.target.value);
  };

  const handleTimePeriodChange = (event) => {
    setSelectedTimePeriod(event.target.value);
  };

  if (loading && !data) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <ThemeProvider theme={theme}>
        <Box sx={{ flexGrow: 1 }}>
          <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Alert severity="error">{error}</Alert>
          </Container>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh', pb: 4 }}>
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Horizon Auto Reporting
            </Typography>
            <Chip
              label={`Connected to ${selectedStation}`}
              color="success"
              variant="outlined"
              sx={{ bgcolor: 'white' }}
            />
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          {/* Controls */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth>
                <InputLabel id="station-select-label">Station</InputLabel>
                <Select
                  labelId="station-select-label"
                  id="station-select"
                  value={selectedStation}
                  onChange={handleStationChange}
                >
                  {NODE_NAMES.map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Base Station</InputLabel>
                <Select value={selectedBaseStation} onChange={handleBaseStationChange}>
                  <MenuItem value="">All Base Stations</MenuItem>
                  {baseStations.map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl sx={{ minWidth: 120, marginRight: 2 }}>
                <InputLabel>Time Period</InputLabel>
                <Select
                  value={selectedTimePeriod}
                  label="Time Period"
                  onChange={(e) => {
                    setSelectedTimePeriod(e.target.value);
                    if (e.target.value === 'custom') {
                      // Set default date range to February data
                      setCustomStartDate('2025-02-03');
                      setCustomEndDate('2025-03-04');
                    }
                  }}
                >
                  <MenuItem value="24h">Last 24 Hours</MenuItem>
                  <MenuItem value="7d">Last 7 Days</MenuItem>
                  <MenuItem value="30d">Last 30 Days</MenuItem>
                  <MenuItem value="custom">Custom Range</MenuItem>
                </Select>
              </FormControl>

              {selectedTimePeriod === 'custom' && (
                <>
                  <FormControl sx={{ minWidth: 200, marginRight: 2 }}>
                    <TextField
                      label="Start Date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </FormControl>
                  <FormControl sx={{ minWidth: 200, marginRight: 2 }}>
                    <TextField
                      label="End Date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </FormControl>
                </>
              )}
            </Grid>
          </Grid>

          <TabContext value={selectedTab}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <TabList onChange={handleTabChange} aria-label="lab API tabs example">
                <Tab label="Overview" value="1" />
                <Tab label="Data Table" value="2" />
              </TabList>
            </Box>

            <TabPanel value="1">
              <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Forward Power"
                  color="#2196f3"
                  globalTimeRange={timeRange}
                  onChartRef={handleForwardPowerChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Reflected Power"
                  color="#f44336"
                  globalTimeRange={timeRange}
                  onChartRef={handleReflectedPowerChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="VSWR"
                  color="#ff9800"
                  globalTimeRange={timeRange}
                  onChartRef={handleVSWRChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Return Loss"
                  color="#9c27b0"
                  globalTimeRange={timeRange}
                  onChartRef={handleReturnLossChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Temperature"
                  color="#4caf50"
                  globalTimeRange={timeRange}
                  onChartRef={handleTemperatureChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Voltage"
                  color="#00bcd4"
                  globalTimeRange={timeRange}
                  onChartRef={handleVoltageChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Current"
                  color="#ff5722"
                  globalTimeRange={timeRange}
                  onChartRef={handleCurrentChartRef}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TimeSeriesChart
                  data={data}
                  metric="Power"
                  color="#795548"
                  globalTimeRange={timeRange}
                  onChartRef={handlePowerChartRef}
                />
              </Grid>
              </Grid>
            </TabPanel>

            <TabPanel value="2">
              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="data table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>Forward Power</TableCell>
                      <TableCell>Reflected Power</TableCell>
                      <TableCell>VSWR</TableCell>
                      <TableCell>Return Loss</TableCell>
                      <TableCell>Temperature</TableCell>
                      <TableCell>Voltage</TableCell>
                      <TableCell>Current</TableCell>
                      <TableCell>Power</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data && (rowsPerPage > 0
                      ? data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      : data
                    ).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.Timestamp ? new Date(row.Timestamp).toLocaleString() : ''}</TableCell>
                        <TableCell>{row['Forward Power']}</TableCell>
                        <TableCell>{row['Reflected Power']}</TableCell>
                        <TableCell>{row.VSWR}</TableCell>
                        <TableCell>{row['Return Loss']}</TableCell>
                        <TableCell>{row.Temperature}</TableCell>
                        <TableCell>{row.Voltage}</TableCell>
                        <TableCell>{row.Current}</TableCell>
                        <TableCell>{row.Power}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25]}
                component="div"
                count={data ? data.length : 0}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </TabPanel>
          </TabContext>

          {/* Report Editor */}
          <Paper sx={{ mt: 4, p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Report Editor
            </Typography>
            <ReportEditor
              groupedStations={{
                [selectedStation]: baseStations.length > 0 ? baseStations : [selectedStation]
              }}
              stationData={{
                [selectedStation]: data ? {
                  [selectedBaseStation || selectedStation]: data
                } : {}
              }}
              chartRefs={chartRefs.current}
            />
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default App;
