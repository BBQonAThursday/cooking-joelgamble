const express = require('express');
const storage = require('../lib/storage');
const { buildHistoryView } = require('../lib/calc');

const router = express.Router();

router.get('/history', (req, res) => {
  res.render('history.njk', buildHistoryView(storage.get(), new Date()));
});

module.exports = router;
