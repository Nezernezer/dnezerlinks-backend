const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();

// Standard CORS
app.use(cors({ origin: '*' }));
// Enable pre-flight across-the-board
app.options('*', cors());

app.use(express.json());

// Routes
app.use('/api', apiRoutes);

app.get('/', (req, res) => res.send("Dnezerlinks API is running."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
