const express = require("express");
const cors = require('cors');
const axios = require("axios"); 
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Initialization
async function initializeDBAndServer() {
    try {
        const { open } = sqlite;
        const path = require("path");
        const dbpath = path.join(__dirname, "roxiler.db");
        const db = await open({ filename: dbpath, driver: sqlite3.Database });
        const PORT = process.env.PORT || 4005; 

        // Create the "products" table if it doesn't exist
        await db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                title TEXT,
                price REAL,
                description TEXT,
                category TEXT,
                image TEXT,
                sold INTEGER,
                dateOfSale TEXT
            );
        `);

        app.locals.db = db; // Make the database accessible throughout the application

        app.listen(PORT, () => {
            console.log("Server Started at " + PORT);

        });
    } catch (error) {
        console.error("Error initializing database and ${PORT}:", error);
    }
}

// Initialize the database and start the server
initializeDBAndServer();

// Fetch and Insert Seed Data into the Database
async function fetchAndInsert() {
    try {
        const response = await axios.get(
            "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
        );
        const data = response.data;
        const db = app.locals.db;

        for (let item of data) {
            const queryData = `SELECT id FROM products WHERE id = ${item.id}`;
            const existingData = await db.get(queryData);
            if (!existingData) {
                const query = `
                    INSERT INTO products (id, title, price, description, category, image, sold, dateOfSale)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                `;

                await db.run(query, [
                    item.id,
                    item.title,
                    item.price,
                    item.description,
                    item.category,
                    item.image,
                    item.sold,
                    item.dateOfSale
                ]);
            }
        }
        console.log("Products added to the database.");
    } catch (error) {
        console.error("Error fetching and inserting data:", error);
    }
}

// Fetch and insert seed data into the database
fetchAndInsert();

// GET
app.get('/', (req, res) => {
    try {
        res.send('Welcome, this is Roxiler company assignment backend domain. Please access any path to get the data');
    } catch (e) {
        console.error(e.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/transactions', async (req, res) => {
    try {
        const db = app.locals.db;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        const selectedMonth = (req.query.month || 'march').toLowerCase();

        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
            'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const numericMonth = monthMap[selectedMonth];

        if (!numericMonth) {
            return res.status(400).json({ error: 'Invalid month' });
        }

        let sqlQuery = `
            SELECT *
            FROM products
            WHERE strftime('%m', dateOfSale) = ?
        `;

        const params = [numericMonth];

        if (search) {
            sqlQuery += `
                AND (
                    lower(title) LIKE '%' || ? || '%'
                    OR lower(description) LIKE '%' || ? || '%'
                    OR CAST(price AS TEXT) LIKE '%' || ? || '%'
                )
            `;
            params.push(search, search, search);
        }

        sqlQuery += `
            LIMIT ? OFFSET ?;
        `;
        params.push(perPage, (page - 1) * perPage);

        const rows = await db.all(sqlQuery, params);

        res.json({
            page,
            perPage,
            transactions: rows
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// GET
app.get('/statistics', async (req, res) => {
    try {
        const db = app.locals.db;
        const selectedMonth = req.query.month || 'march';

        if (!selectedMonth) {
            return res.status(400).json({ error: 'Month parameter is required.' });
        }

        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
            'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const numericMonth = monthMap[selectedMonth.toLowerCase()];

        if (!numericMonth) {
            return res.status(400).json({ error: 'Invalid month name.' });
        }

        const sqlQuery = `
            SELECT
                SUM(CASE WHEN sold = 1 THEN price ELSE 0 END) as totalSaleAmount,
                COUNT(CASE WHEN sold = 1 THEN 1 END) as totalSoldItems,
                COUNT(CASE WHEN sold = 0 THEN 1 END) as totalNotSoldItems
            FROM products
            WHERE strftime('%m', dateOfSale) = ?;
        `;

        const statistics = await db.get(sqlQuery, [numericMonth]);

        if (!statistics) {
            return res.status(404).json({ error: 'No data found for the selected month.' });
        }

        res.json({
            selectedMonth,
            totalSaleAmount: Math.floor(statistics.totalSaleAmount) || 0,
            totalSoldItems: statistics.totalSoldItems || 0,
            totalNotSoldItems: statistics.totalNotSoldItems || 0
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET
app.get('/bar-chart', async (req, res) => {
    try {
        const db = app.locals.db;
        const selectedMonth = req.query.month || 'march';

        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
            'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const numericMonth = monthMap[selectedMonth.toLowerCase()];

        if (!numericMonth) {
            return res.status(400).json({ error: 'Month parameter is required.' });
        }

        const sqlQuery = `
            SELECT
                CASE
                    WHEN price BETWEEN 0 AND 100 THEN '0 - 100'
                    WHEN price BETWEEN 101 AND 200 THEN '101 - 200'
                    WHEN price BETWEEN 201 AND 300 THEN '201 - 300'
                    WHEN price BETWEEN 301 AND 400 THEN '301 - 400'
                    WHEN price BETWEEN 401 AND 500 THEN '401 - 500'
                    WHEN price BETWEEN 501 AND 600 THEN '501 - 600'
                    WHEN price BETWEEN 601 AND 700 THEN '601 - 700'
                    WHEN price BETWEEN 701 AND 800 THEN '701 - 800'
                    WHEN price BETWEEN 801 AND 900 THEN '801 - 900'
                    WHEN price >= 901 THEN '901-above'
                END as priceRange,
                COUNT(*) as itemCount
            FROM products
            WHERE strftime('%m', dateOfSale) = ?
            GROUP BY priceRange;
        `;

        const barChartData = await db.all(sqlQuery, [numericMonth]);
        res.json(barChartData);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET
app.get('/pie-chart', async (req, res) => {
    try {
        const db = app.locals.db;
        const selectedMonth = req.query.month || 'march';

        if (!selectedMonth) {
            return res.status(400).json({ error: 'Month parameter is required.' });
        }

        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
            'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const numericMonth = monthMap[selectedMonth.toLowerCase()];

        const sqlQuery = `
            SELECT DISTINCT
                category,
                COUNT(*) as itemCount
            FROM products
            WHERE strftime('%m', dateOfSale) = ?
            GROUP BY category;
        `;

        const pieChartData = await db.all(sqlQuery, [numericMonth]);
        res.json(pieChartData);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/combined-response', async (req, res) => {
    try {
        const db = app.locals.db;
        const selectedMonth = req.query.month || 'march';
        const {search, page, perPage} = req.query;

        if (!selectedMonth) {
            return res.status(400).json({ error: 'Month parameter is required.' });
        }

        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
            'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const numericMonth = monthMap[selectedMonth.toLowerCase()];

        const transactionsData = await fetchTransactions(db, numericMonth, search, page || 1, perPage || 10);
        const statisticsData = await fetchStatistics(db, numericMonth);
        const barChartData = await fetchBarChart(db, numericMonth);
        const pieChartData = await fetchPieChart(db, numericMonth);

        const combinedResponse = {
            transactions: transactionsData,
            statistics: statisticsData,
            barChart: barChartData,
            pieChart: pieChartData,
        };

        res.json(combinedResponse);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function fetchTransactions(db, numericMonth, search, page, perPage) {
    const sqlQuery = `
        SELECT *
        FROM products
        WHERE
            strftime('%m', dateOfSale) = ?
            AND (
                lower(title) LIKE '%${search}%'
                OR lower(description) LIKE '%${search}%'
                OR CAST(price AS TEXT) LIKE '%${search}%'
            )
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage};
    `;

    return await db.all(sqlQuery, [numericMonth]);
}

async function fetchStatistics(db, numericMonth) {
    const sqlQuery = `
      SELECT
        CAST(SUM(CASE WHEN sold = 1 THEN price ELSE 0 END) as INT) as totalSaleAmount,
        COUNT(CASE WHEN sold = 1 THEN 1 END) as totalSoldItems,
        COUNT(CASE WHEN sold = 0 THEN 1 END) as totalNotSoldItems
      FROM products
      WHERE strftime('%m', dateOfSale) = ?;
    `;

    return await db.get(sqlQuery, [numericMonth]);
}

async function fetchBarChart(db, numericMonth) {
    const sqlQuery = `
    SELECT
      CASE
        WHEN price BETWEEN 0 AND 100 THEN '0 - 100'
        WHEN price BETWEEN 101 AND 200 THEN '101 - 200'
        WHEN price BETWEEN 201 AND 300 THEN '201 - 300'
        WHEN price BETWEEN 301 AND 400 THEN '301 - 400'
        WHEN price BETWEEN 401 AND 500 THEN '401 - 500'
        WHEN price BETWEEN 501 AND 600 THEN '501 - 600'
        WHEN price BETWEEN 601 AND 700 THEN '601 - 700'
        WHEN price BETWEEN 701 AND 800 THEN '701 - 800'
        WHEN price BETWEEN 801 AND 900 THEN '801 - 900'
        WHEN price >= 901 THEN '901-above'
      END as priceRange,
      COUNT(*) as itemCount
    FROM products
    WHERE strftime('%m', dateOfSale) = ?
    GROUP BY priceRange;
  `;

  return await db.all(sqlQuery, [numericMonth]);
}

async function fetchPieChart(db, numericMonth) {
    const sqlQuery = `
      SELECT DISTINCT
        category,
        COUNT(*) as itemCount
      FROM products
      WHERE strftime('%m', dateOfSale) = ?
      GROUP BY category;
    `;

    return await db.all(sqlQuery, [numericMonth]);
}


app.get('/all-transactions', async (req, res) => {
    try {
        const db = app.locals.db;

        // SQL query to select all records from the products table
        const sqlQuery = `
            SELECT *
            FROM products;
        `;

        // Execute the SQL query
        const rows = await db.all(sqlQuery);

        // Send the response with all transactions
        res.json({
            transactions: rows
        });

    } catch (error) {
        console.error('Error fetching all transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
