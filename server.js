const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Use port 5000 for the web server, 3306 is for MySQL
const serverPort = process.env.SERVER_PORT || 5000;
let db;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', dbConnected: !!db });
});

// Initialize MySQL connection pool
async function initializeDB() {
  try {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'john',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'horiserverlive',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    console.log('Initializing database with config:', {
      ...config,
      password: '****' // Don't log the password
    });

    // Create the connection pool
    db = await mysql.createPool(config);
    
    // Test connection and check database/tables
    const [tables] = await db.query('SHOW TABLES');
    console.log('Successfully connected to MySQL database');
    console.log('Available tables:', tables);

    // Verify required tables exist
    const requiredTables = ['node_status_table'];
    const existingTables = tables.map(row => Object.values(row)[0]);
    
    for (const table of requiredTables) {
      if (!existingTables.includes(table)) {
        throw new Error(`Required table '${table}' not found in database`);
      }
    }

    // Test query on node_status_table
    const [testRow] = await db.query('SELECT COUNT(*) as count FROM node_status_table');
    console.log('node_status_table row count:', testRow[0].count);
  } catch (err) {
    console.error('Error initializing database:', err);
    console.error('Database connection failed. Please check your configuration.');
    console.error('Environment variables:', {
      DB_HOST: process.env.DB_HOST,
      DB_USER: process.env.DB_USER,
      DB_NAME: process.env.DB_NAME,
      DB_PORT: process.env.DB_PORT
    });
    db = null; // Reset db connection if it failed
    process.exit(1);
  }
}

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

app.get('/api/data/:nodeName/:timePeriod', async (req, res) => {
  const { nodeName, timePeriod } = req.params;
  const { baseStation } = req.query;
  console.log('\n[/api/data] Request:', { nodeName, baseStation, timePeriod });
  
  try {
    if (!db) {
      console.error('Database connection not initialized');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    console.log('Database connection status:', !!db);

    // First verify the node exists
    const [nodeCheck] = await db.query('SELECT DISTINCT NodeName FROM node_status_table WHERE NodeName = ?', [nodeName]);
    if (nodeCheck.length === 0) {
      return res.status(404).json({ error: `Node '${nodeName}' not found` });
    }

    // If baseStation is specified, verify it exists for this node
    if (baseStation) {
      const [baseStationCheck] = await db.query(
        'SELECT DISTINCT NodeBaseStationName FROM node_status_table WHERE NodeName = ? AND NodeBaseStationName = ?',
        [nodeName, baseStation]
      );
      if (baseStationCheck.length === 0) {
        return res.status(404).json({ error: `Base station '${baseStation}' not found for node '${nodeName}'` });
      }
    }

    // Calculate time filter based on period
    let timeFilter;
    const now = new Date();
    
    switch (timePeriod) {
      case '1h':
        timeFilter = new Date(now - 60 * 60 * 1000);
        break;
      case '24h':
        timeFilter = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeFilter = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeFilter = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return res.status(400).json({
          error: 'Invalid time period. Must be one of: 1h, 24h, 7d, 30d'
        });
    }

    timeFilter = timeFilter.toISOString().slice(0, 19).replace('T', ' ');
    console.log('Time filter:', timeFilter);

    const params = [nodeName];
    let baseStationFilter = '';
    
    if (baseStation) {
      baseStationFilter = ' AND NodeBaseStationName = ?';
      params.push(baseStation);
    }

    const query = `
      SELECT 
        NodeName,
        NodeBaseStationName,
        time as Timestamp,
        Analog1Value as 'Forward Power',
        Analog2Value as 'Reflected Power',
        Analog3Value as Temperature,
        Analog4Value as Voltage,
        Analog5Value as Current,
        Analog6Value as Power,
        ROUND(
          CASE 
            WHEN Analog1Value > 0 AND Analog2Value > 0
            THEN (1 + SQRT(Analog2Value/Analog1Value))/(1 - SQRT(Analog2Value/Analog1Value))
            ELSE 1
          END
        , 2) as VSWR,
        ROUND(
          CASE 
            WHEN Analog1Value > 0 AND Analog2Value > 0
            THEN -20 * LOG10(SQRT(Analog2Value/Analog1Value))
            ELSE 0
          END
        , 2) as 'Return Loss'
      FROM node_status_table
      WHERE NodeName = ?
      ${baseStationFilter}
      AND time >= ?
      ORDER BY time DESC
    `;

    console.log('Query:', query);

    console.log('\nData query:', query);
    console.log('Query params:', params);
    console.log('Time filter:', timeFilter);

    const [rows] = await db.query(query, params);
    
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'No data found',
        params: { nodeName, baseStation, timePeriod }
      });
    }

    res.json(rows);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({
      error: 'Failed to fetch data',
      message: err.message
    });
  }
});

// ... (rest of the code remains the same)

// Get base stations endpoint
app.get('/api/base-stations/:nodeName', async (req, res) => {
  const { nodeName } = req.params;
  console.log('\n[/api/base-stations] Request:', { nodeName });

  try {
    if (!db) {
      console.error('Database connection not initialized');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // First verify the node exists
    const [nodeCheck] = await db.query(
      'SELECT DISTINCT NodeName FROM node_status_table WHERE NodeName = ?',
      [nodeName]
    );

    if (nodeCheck.length === 0) {
      return res.status(404).json({ error: `Node '${nodeName}' not found` });
    }

    // Get base stations for this node
    const [rows] = await db.query(
      'SELECT DISTINCT NodeBaseStationName FROM node_status_table WHERE NodeName = ? ORDER BY NodeBaseStationName',
      [nodeName]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: `No base stations found for node '${nodeName}'`
      });
    }

    const baseStations = rows.map(row => row.NodeBaseStationName);
    console.log('Found base stations:', baseStations);
    res.json(baseStations);
  } catch (err) {
    console.error('Error fetching base stations:', err);
    res.status(500).json({ error: 'Failed to fetch base stations' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// Start server with error handling and port conflict resolution
async function startServer() {
  try {
    await initializeDB();
    
    // Try to start the server
    const server = app.listen(serverPort)
      .on('error', async (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${serverPort} is busy, trying port ${serverPort + 1}`);
          // Try the next port
          const nextServer = app.listen(serverPort + 1)
            .on('error', (err) => {
              console.error('Failed to start server on alternate port:', err);
              process.exit(1);
            })
            .on('listening', () => {
              console.log(`Server running on alternate port ${serverPort + 1}`);
            });
        } else {
          console.error('Failed to start server:', error);
          process.exit(1);
        }
      })
      .on('listening', () => {
        console.log(`Server running on port ${serverPort}`);
      });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (db) {
    await db.end();
  }
  process.exit(0);
});

startServer();
