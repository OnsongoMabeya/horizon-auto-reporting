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
import { ReportEditor } from './components/ReportEditor';

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

// Components
const TimeSeriesChart = ({ data, metric, color, onChartRef }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartRef.current) return;

    // Always destroy the previous chart instance before creating a new one
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const ctx = chartRef.current.getContext('2d');

    const chartData = data.map(item => ({
      x: new Date(item.Timestamp),
      y: Number(item[metric])
    }));

    // Sort data by timestamp
    chartData.sort((a, b) => a.x - b.x);

    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: metric,
          data: chartData,
          borderColor: color,
          backgroundColor: color + '40',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: { unit: 'hour' },
            title: { display: true, text: 'Time' },
            adapters: {
              date: {
                locale: enUS
              }
            }
          },
          y: {
            title: { display: true, text: metric },
            beginAtZero: true
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });

    chartInstance.current = newChart;
    
    // Pass the canvas element to parent
    if (onChartRef) {
      onChartRef(chartRef.current);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data, metric, color, onChartRef]);

  useEffect(() => {
    if (chartRef.current) {
      onChartRef(chartRef.current);
    }
  }, [onChartRef]);

  return (
    <Card elevation={3} sx={{ height: '100%', p: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom color="primary">
          {metric} Readings
        </Typography>
        <div style={{ height: '300px', width: '100%' }}>
          <canvas ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  );
};

const App = () => {
  const chartRefs = useRef({});
  const [selectedStation, setSelectedStation] = useState(NODE_NAMES[0]);
  const [baseStations, setBaseStations] = useState([]);
  const [selectedBaseStation, setSelectedBaseStation] = useState('');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(TIME_PERIODS[0].value);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('1');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

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
  const SERVER_PORT = window.location.hostname === 'localhost' ? 5000 : 80;
  const API_BASE_URL = `http://${window.location.hostname}:${SERVER_PORT}`;

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
      const url = selectedBaseStation
        ? `${API_BASE_URL}/api/data/${selectedStation}/${selectedBaseStation}/${selectedTimePeriod}`
        : `${API_BASE_URL}/api/data/${selectedStation}/${selectedTimePeriod}`;
      
      const response = await axios.get(url);
      setData(response.data);
    } catch (err) {
      setError('Failed to fetch data. Please try again later.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStation, selectedBaseStation, selectedTimePeriod, API_BASE_URL]);

  useEffect(() => {
    fetchBaseStations(selectedStation);
  }, [selectedStation, fetchBaseStations, API_BASE_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStationChange = (event) => {
    setSelectedStation(event.target.value);
  };

  const handleTimePeriodChange = (event) => {
    setSelectedTimePeriod(event.target.value);
  };

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
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
                  label="Station"
                  onChange={handleStationChange}
                >
                  {NODE_NAMES.map((station) => (
                    <MenuItem key={station} value={station}>
                      {station}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth>
                <InputLabel id="base-station-select-label">Base Station</InputLabel>
                <Select
                  labelId="base-station-select-label"
                  id="base-station-select"
                  value={selectedBaseStation}
                  label="Base Station"
                  onChange={(e) => setSelectedBaseStation(e.target.value)}
                >
                  {baseStations.map((station) => (
                    <MenuItem key={station} value={station}>
                      {station}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth>
                <InputLabel id="time-period-select-label">Time Period</InputLabel>
                <Select
                  labelId="time-period-select-label"
                  id="time-period-select"
                  value={selectedTimePeriod}
                  label="Time Period"
                  onChange={handleTimePeriodChange}
                >
                  {TIME_PERIODS.map((period) => (
                    <MenuItem key={period.value} value={period.value}>
                      {period.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Tabs and Content */}
          <TabContext value={selectedTab}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <TabList onChange={handleTabChange} aria-label="lab API tabs example">
                <Tab label="Overview" value="1" />
                <Tab label="Data Table" value="2" />
              </TabList>
            </Box>

            <TabPanel value="1">
              <Stack spacing={3} sx={{ width: '100%' }}>
                <TimeSeriesChart
                  data={data}
                  metric="Voltage"
                  color="#2196f3"
                  onChartRef={(el) => {
                    if (!chartRefs.current[selectedBaseStation]) {
                      chartRefs.current[selectedBaseStation] = {};
                    }
                    chartRefs.current[selectedBaseStation]['Voltage'] = el;
                  }}
                />
                <TimeSeriesChart
                  data={data}
                  metric="Current"
                  color="#f44336"
                  onChartRef={(el) => {
                    if (!chartRefs.current[selectedBaseStation]) {
                      chartRefs.current[selectedBaseStation] = {};
                    }
                    chartRefs.current[selectedBaseStation]['Current'] = el;
                  }}
                />
                <TimeSeriesChart
                  data={data}
                  metric="Power"
                  color="#4caf50"
                  onChartRef={(el) => {
                    if (!chartRefs.current[selectedBaseStation]) {
                      chartRefs.current[selectedBaseStation] = {};
                    }
                    chartRefs.current[selectedBaseStation]['Power'] = el;
                  }}
                />
              </Stack>
            </TabPanel>

            <TabPanel value="2">
              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="data table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell align="right">Voltage</TableCell>
                      <TableCell align="right">Current</TableCell>
                      <TableCell align="right">Power</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((row, index) => (
                        <TableRow
                          key={index}
                          sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                        >
                          <TableCell component="th" scope="row">
                            {new Date(row.Timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell align="right">{row.Voltage}</TableCell>
                          <TableCell align="right">{row.Current}</TableCell>
                          <TableCell align="right">{row.Power}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25]}
                  component="div"
                  count={data.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                />
              </TableContainer>
            </TabPanel>
          </TabContext>

          {/* Report Editor */}
          <Paper sx={{ mt: 4, p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Report Editor
            </Typography>
            <ReportEditor
              groupedStations={{
                [selectedStation]: selectedBaseStation ? [selectedBaseStation] : baseStations
              }}
              stationData={{
                [selectedBaseStation]: data.map(d => ({
                  timestamp: d.Timestamp,
                  latency: d.Voltage,  // Using Voltage as latency
                  packet_loss: d.Current,  // Using Current as packet loss
                  signal_strength: d.Power,  // Using Power as signal strength
                  throughput: d.Power  // Using Power as throughput for now
                }))
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
