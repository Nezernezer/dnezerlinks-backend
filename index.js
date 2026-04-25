const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// This makes all routes accessible under /api/...
app.use('/api', apiRoutes);

app.get('/', (req, res) => res.send("Dnezerlinks API is running."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
