const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors()); // Enable CORS for all routes

// Increase payload size limit for JSON
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

const dbPort = process.env.PORT || 3306; // Database port
const serverPort = process.env.SERVER_PORT || 5000; // Server port // Use fixed port 5000 for the server

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    console.error('Please check your .env file configuration:');
    console.error('DB_HOST:', process.env.DB_HOST);
    console.error('DB_USER:', process.env.DB_USER);
    console.error('DB_NAME:', process.env.DB_NAME);
    return;
  }
  console.log('Successfully connected to MySQL database');
});

// API Routes
app.get('/api/date-range', (req, res) => {
  const { nodeName } = req.query;
  
  let query = `SELECT 
    MIN(time) as minDate, 
    MAX(time) as maxDate
    FROM node_status_table
    WHERE NodeName IN ('Aviation FM', 'Emoo FM', 'Genset02', 'Kameme FM', 'MediaMax1')`;
  
  const params = [];
  if (nodeName) {
    query += ' AND NodeName = ?';
    params.push(nodeName);
  }
  
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Date range query error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({
      minDate: results[0].minDate,
      maxDate: results[0].maxDate
    });
  });
});

// Get all base stations for a node
app.get('/api/base-stations/:nodeName', async (req, res) => {
  const { nodeName } = req.params;
  
  try {
    const query = `
      SELECT DISTINCT NodeBaseStationName 
      FROM node_status_table 
      WHERE NodeName = ? 
      ORDER BY NodeBaseStationName
    `;
    
    const [rows] = await db.promise().query(query, [nodeName]);
    const baseStations = rows.map(row => row.NodeBaseStationName);
    res.json(baseStations);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Failed to fetch base stations' });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const { data } = req.body;
    const result = await db.query('INSERT INTO measurements SET ?', data);
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { baseStation, data, images } = req.body;
    
    if (!baseStation || !data) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    console.log('Received data for analysis:', {
      baseStation,
      dataKeys: Object.keys(data),
      imageKeys: images ? Object.keys(images) : 'no images'
    });
    
    // Generate analysis based on the data
    const analysis = generateAnalysis(baseStation, data, images);
    
    res.json({ narration: analysis });
  } catch (error) {
    console.error('Error analyzing data:', error);
    res.status(500).json({ error: `Failed to analyze data: ${error.message}` });
  }
});

function generateAnalysis(baseStation, data, images) {
  // Ensure data exists and has required properties
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data format');
  }

  // Calculate statistics
  const stats = {
    voltage: calculateStats(data.voltage || []),
    current: calculateStats(data.current || []),
    power: calculateStats(data.power || [])
  };

  // Calculate trends and additional insights
  const trends = {
    voltage: calculateTrend(data.voltage || []),
    current: calculateTrend(data.current || []),
    power: calculateTrend(data.power || [])
  };

  // Generate narration
  let narration = `<h3>Performance Analysis for Base Station ${baseStation}</h3>\n\n`;

  // Latency Analysis
  narration += `<h4>Network Latency Analysis</h4>\n`;
  narration += `<p>The network latency measurements show an average response time of ${stats.voltage.avg.toFixed(2)}ms. `;
  narration += `Peak latency reached ${stats.voltage.max.toFixed(2)}ms during high traffic periods, while the lowest recorded was ${stats.voltage.min.toFixed(2)}ms. `;
  narration += `${trends.voltage} `;
  narration += `The latency variance suggests ${getLatencyAssessment(stats.voltage)}.</p>\n\n`;

  // Packet Loss Analysis
  narration += `<h4>Network Reliability Analysis</h4>\n`;
  narration += `<p>Network reliability measurements indicate an average packet loss rate of ${stats.current.avg.toFixed(2)}%. `;
  narration += `The highest packet loss observed was ${stats.current.max.toFixed(2)}%, while the best performance showed only ${stats.current.min.toFixed(2)}% loss. `;
  narration += `${trends.current} `;
  narration += `${getReliabilityAssessment(stats.current)}.</p>\n\n`;

  // Signal Strength Analysis
  narration += `<h4>Signal Quality Analysis</h4>\n`;
  narration += `<p>The base station maintained an average signal strength of ${stats.power.avg.toFixed(2)}dBm. `;
  narration += `Signal peaks reached ${stats.power.max.toFixed(2)}dBm under optimal conditions, while dropping to ${stats.power.min.toFixed(2)}dBm at its weakest. `;
  narration += `${trends.power} `;
  narration += `${getSignalAssessment(stats.power)}.</p>\n\n`;

  // Overall Assessment
  narration += `<h4>Overall Performance Assessment</h4>\n`;
  narration += `<p>${getOverallAssessment(stats)}</p>\n\n`;

  return narration;
}

function calculateStats(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, stdDev: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Calculate standard deviation
  const stdDev = Math.sqrt(
    values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length
  );

  return { min, max, avg, stdDev };
}

function calculateTrend(values) {
  if (!values || values.length < 2) return 'Insufficient data for trend analysis.';

  const recentValues = values.slice(-10); // Look at last 10 values
  const firstHalf = recentValues.slice(0, 5);
  const secondHalf = recentValues.slice(-5);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;
  const percentChange = (diff / firstAvg) * 100;

  if (Math.abs(percentChange) < 5) {
    return 'The measurements have remained relatively stable recently.';
  } else if (percentChange > 0) {
    return `There is an increasing trend with a ${percentChange.toFixed(1)}% rise in recent measurements.`;
  } else {
    return `There is a decreasing trend with a ${Math.abs(percentChange).toFixed(1)}% drop in recent measurements.`;
  }
}

function getLatencyAssessment(stats) {
  if (stats.avg < 50) {
    return 'indicating excellent network responsiveness';
  } else if (stats.avg < 100) {
    return 'showing good network performance';
  } else if (stats.avg < 200) {
    return 'suggesting moderate network congestion';
  } else {
    return 'indicating significant network delays that may need attention';
  }
}

function getReliabilityAssessment(stats) {
  if (stats.avg < 1) {
    return 'The network shows excellent reliability with minimal packet loss';
  } else if (stats.avg < 3) {
    return 'Network reliability is within acceptable ranges';
  } else if (stats.avg < 5) {
    return 'Packet loss rates indicate some network stability issues';
  } else {
    return 'High packet loss rates suggest significant network problems requiring investigation';
  }
}

function getSignalAssessment(stats) {
  if (stats.avg > -50) {
    return 'Signal strength is excellent, providing optimal coverage';
  } else if (stats.avg > -70) {
    return 'Signal strength is good for reliable operations';
  } else if (stats.avg > -85) {
    return 'Signal strength is adequate but could be improved';
  } else {
    return 'Signal strength is weak and may cause connectivity issues';
  }
}

function getOverallAssessment(stats) {
  const issues = [];
  
  if (stats.voltage.avg > 100) issues.push('high latency');
  if (stats.current.avg > 3) issues.push('significant packet loss');
  if (stats.power.avg < -80) issues.push('weak signal strength');

  if (issues.length === 0) {
    return 'Overall, the base station is performing optimally with good latency, minimal packet loss, and strong signal quality.';
  } else {
    return `The base station requires attention due to ${issues.join(', ')}. Consider investigating these issues to improve network performance.`;
  }
}

app.get('/api/data/:nodeName/:baseStation?/:timePeriod', async (req, res) => {
  const { nodeName, baseStation, timePeriod } = req.params;
  console.log('API Request:', { nodeName, timePeriod });
  
  try {
    let timeFilter = '';
    // First get the latest timestamp for the node
    const getLatestTimestampQuery = `
      SELECT MAX(time) as latest_time
      FROM node_status_table
      WHERE NodeName = ?
    `;

    const [latestTimeResult] = await db.promise().query(getLatestTimestampQuery, [nodeName]);
    const latestTime = latestTimeResult[0].latest_time;

    if (!latestTime) {
      return res.json([]);
    }

    // Calculate the time threshold based on the latest data point
    const latestDate = new Date(latestTime);
    let timeThreshold;
    switch (timePeriod) {
      case '7d':
        timeThreshold = new Date(latestDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeThreshold = new Date(latestDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // 24h
        timeThreshold = new Date(latestDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const dataQuery = `SELECT 
      id, NodeName, NodeBaseStationName, 
      DATE_FORMAT(time, '%Y-%m-%d %H:%i:%s') as Timestamp,
      StatusCommentsStr as Status,
      Analog1Value as Voltage, Analog2Value as Current, Analog3Value as Power,
      Digital1Value, Digital1Alarm, Digital2Value, Digital2Alarm
      FROM node_status_table
      WHERE NodeName = ?
      ${baseStation ? 'AND NodeBaseStationName = ?' : ''}
      AND time >= ?
      ORDER BY time DESC`;
    
    console.log('Executing query with params:', { nodeName, timeThreshold: timeThreshold.toISOString() });
    const params = baseStation ? [nodeName, baseStation, timeThreshold] : [nodeName, timeThreshold];
    console.log('Executing query with params:', { nodeName, baseStation, timeThreshold: timeThreshold.toISOString() });
    const [rows] = await db.promise().query(dataQuery, params);
    console.log('Query returned', rows.length, 'records');
    
    res.json(rows);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ 
      error: 'Database error',
      details: err.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server with error handling
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(serverPort);
