# Horizon Auto Reporting

A web application for fetching and displaying data from a MySQL database using Node.js, Express, and React with Material UI.

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm (Node Package Manager)

## Project Structure

```bash
horizonautoreporting/
├── client/                 # React frontend
│   ├── node_modules/       # Frontend dependencies
│   ├── public/            # Static files
│   └── src/               # React source code
├── node_modules/          # Backend dependencies
├── .env                   # Environment variables (create this file)
├── package.json           # Backend dependencies and scripts
├── server.js              # Express server
└── README.md              # This file
```

## Setup Instructions

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd horizonautoreporting
   ```

2. **Install Dependencies**

   ```bash
   # Install backend dependencies
   npm install

   # Install frontend dependencies
   cd client
   npm install
   cd ..
   ```

3. **MySQL Database Setup**
   - Ensure MySQL server is running
   - Create your database and table
   - Note down your database credentials

4. **Environment Configuration**

   Create a `.env` file in the root directory with the following content:

    ```bash
    DB_HOST=localhost
    DB_USER=your_mysql_username
    DB_PASSWORD=your_mysql_password
    DB_NAME=your_database_name
    PORT=5000
    ```

   Replace the values with your actual MySQL credentials.

5. **Update Table Name**

   In `server.js`, replace `'your_table_name'` with your actual table name:

   ```javascript
   const query = 'SELECT * FROM your_actual_table_name';
   ```

## Running the Application

1. **Start the Backend Server**

   ```bash
   npm run dev
   ```

   The server will start on ```http://localhost:5000```

2. **Start the Frontend**

   In a new terminal:

   ```bash
   npm run client
   ```

   The frontend will start on ```http://localhost:3000```

3. **Run Both Together**

   ```bash
   npm run dev:full
   ```

## API Endpoints

- `GET /api/data`: Fetches all data from the specified table

## Development

### Backend

- The server uses Express.js and MySQL2 for database operations
- Error handling middleware is implemented for better debugging
- CORS is enabled for frontend communication

### Frontend

- Built with React and Material UI
- Responsive table display of data
- Loading and error states implemented
- Material UI theme customization available in `client/src/index.js`

## Troubleshooting

1. **MySQL Connection Issues**
   - Verify MySQL server is running
   - Check `.env` file credentials
   - Ensure database and table exist

2. **Frontend Not Connecting to Backend**
   - Check if both servers are running
   - Verify CORS settings in `server.js`
   - Check network tab in browser dev tools

3. **Dependency Issues**
   - Delete `node_modules` and `package-lock.json`
   - Run `npm install` again
   - For frontend issues, do the same in the `client` directory

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
