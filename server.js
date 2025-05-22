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

// Use port 5000 for the web server
const serverPort = process.env.SERVER_PORT || 5000;
const dbPort = process.env.DB_PORT || 3306;  // Separate port for MySQL
let db;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', dbConnected: !!db });
});

// Initialize MySQL connection pool with retries
async function initializeDB(retries = 3, delay = 5000) {
  if (db) {
    return db;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempting to connect to database (attempt ${attempt}/${retries})...`);
      
      db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: dbPort,  // Use separate port for MySQL
        user: process.env.DB_USER || 'john',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'horiserverlive',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 20000, // 20 second timeout
        acquireTimeout: 20000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      });

      // Test the connection
      const connection = await db.getConnection();
      console.log('Successfully connected to MySQL database');

      try {
        // Verify database access
        const [rowCount] = await connection.query('SELECT COUNT(*) as count FROM node_status_table');
        console.log(`Database has ${rowCount[0].count} records`);

        // Cache initial data
        const [nodes] = await connection.query('SELECT DISTINCT NodeName FROM node_status_table');
        console.log('Available nodes:', nodes.map(node => node.NodeName));

        const [baseStations] = await connection.query('SELECT DISTINCT NodeBaseStationName FROM node_status_table');
        console.log('Available base stations:', baseStations.map(station => station.NodeBaseStationName));

        return db;
      } catch (queryError) {
        console.error('Error querying database:', queryError);
        throw queryError;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error(`Database connection attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        console.error('All database connection attempts failed');
        throw error;
      }
      
      console.log(`Waiting ${delay/1000} seconds before retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
  const { baseStation, startDate, endDate } = req.query;
  console.log('\n[/api/data] Request:', { nodeName, baseStation, timePeriod, startDate, endDate });
  
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

    // Calculate start time based on time period
    const now = new Date();
    let startTime;
    let endTime;

    if (timePeriod === 'custom' && startDate && endDate) {
      console.log('Custom date range:', { startDate, endDate });
      startTime = new Date(startDate);
      endTime = new Date(endDate);
      // Set end time to end of day
      endTime.setHours(23, 59, 59, 999);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      if (endTime < startTime) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }

      console.log('Parsed dates:', {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });
    } else {
      switch (timePeriod) {
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          return res.status(400).json({ error: 'Invalid time period' });
      }
      endTime = now;
    }

    // Then verify the base station exists for this node
    if (baseStation) {
      const [baseStationCheck] = await db.query('SELECT DISTINCT NodeBaseStationName FROM node_status_table WHERE NodeName = ? AND NodeBaseStationName = ?', [nodeName, baseStation]);

      if (baseStationCheck.length === 0) {
        return res.status(404).json({
          error: `Base station '${baseStation}' not found for node '${nodeName}'`
        });
      }
    }

    // First check if there's any data in the requested time period
    const [timeCheck] = await db.query(
      'SELECT MAX(time) as latest, MIN(time) as earliest FROM node_status_table WHERE NodeName = ?',
      [nodeName]
    );

    if (!timeCheck[0].latest) {
      return res.status(404).json({
        error: `No data found for node '${nodeName}'`,
        details: 'Node exists but has no data'
      });
    }

    // Check if the requested time period has any data
    const [periodCheck] = await db.query(
      'SELECT COUNT(*) as count FROM node_status_table WHERE NodeName = ? AND time >= ?',
      [nodeName, startTime]
    );

    if (periodCheck[0].count === 0) {
      return res.status(404).json({
        error: `No data found for node '${nodeName}' in the last ${timePeriod}`,
        details: {
          requestedPeriod: timePeriod,
          latestDataPoint: timeCheck[0].latest,
          earliestDataPoint: timeCheck[0].earliest
        }
      });
    }

    // Get data for the specified time period
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
      AND DATE(time) >= DATE(?)
      AND DATE(time) <= DATE(?)
      ${baseStation ? 'AND NodeBaseStationName = ?' : ''}
      ORDER BY time DESC
    `;

    console.log('Query:', query);
    const queryParams = [nodeName, startTime, endTime, baseStation].filter(param => param !== undefined);
    console.log('Query params:', queryParams);
    console.log('Time range:', { startTime, endTime });

    // Execute the query
    const [rows] = await db.query(query, queryParams);
    console.log(`Found ${rows.length} rows`);
    
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
    const [baseStations] = await db.query(
      'SELECT DISTINCT NodeBaseStationName FROM node_status_table WHERE NodeName = ? ORDER BY NodeBaseStationName',
      [nodeName]
    );

    res.json(baseStations.map(row => row.NodeBaseStationName));
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
async function startServer(port = serverPort) {
  try {
    // Initialize database with retries before starting server
    await initializeDB(3, 5000);

    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        resolve(server);
      }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} is busy, trying ${port + 1}`);
          resolve(startServer(port + 1));
        } else {
          reject(err);
        }
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    if (error.code === 'ETIMEDOUT') {
      console.error('Database connection timed out. Please check that MySQL is running and accessible.');
    }
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
