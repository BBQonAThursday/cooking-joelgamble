const express = require('express');
const storage = require('../lib/storage');
const { buildWeeklyView } = require('../lib/calc');

const router = express.Router();

router.get('/this-week', (req, res) => {
  res.render('this-week.njk', buildWeeklyView(storage.get(), new Date()));
});

module.exports = router;
