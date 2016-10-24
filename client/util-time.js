var AmpersandModel = require('ampersand-model');
var AmpersandColllection = require('ampersand-collection');
var moment = require('moment-timezone');
var app = require('ampersand-app');

/**
 * Time is grouped by truncating; the resolution is determined in util-time.getResolution()
 * See [this table](http://momentjs.com/docs/#/durations/creating/) for accpetable values
 * when using a crossfilter dataset.
 */
function getResolution (start, end) {
  var humanized = end.from(start, true).split(' ');

  var units = humanized[humanized.length - 1];
  if (units === 'minute') {
    units = 'seconds';
  } else if (units === 'hour') {
    units = 'minutes';
  } else if (units === 'day') {
    units = 'hours';
  } else if (units === 'week') {
    units = 'days';
  } else if (units === 'month') {
    units = 'days';
  } else if (units === 'year') {
    units = 'months';
  }
  return units;
}

function getFormat (units) {
  var fmt;
  if (units === 'seconds') {
    fmt = 'mm:ss';
  } else if (units === 'minutes') {
    fmt = 'HH:mm';
  } else if (units === 'hours') {
    fmt = 'HH:00';
  } else if (units === 'days') {
    fmt = 'dddd do';
  } else if (units === 'weeks') {
    fmt = 'wo';
  } else if (units === 'months') {
    fmt = 'YY MMM';
  } else if (units === 'years') {
    fmt = 'YYYY';
  }
  return fmt;
}

var postgresTimeParts = [
  {
    format: 'NONE',
    description: 'No change',
    type: 'datetime'
  },

  // Continuous parts for use in EXTRACT(format FROM date)
  { format: 'microseconds', description: 'microsecond (000000-999999)', type: 'continuous', min: 0, max: 999999 },
  { format: 'milliseconds', description: 'millisecond (000-999)', type: 'continuous', min: 0, max: 999 },
  { format: 'second', description: 'Second of minute (0-60)', type: 'continuous', min: 0, max: 60 },
  { format: 'epoch', description: 'Seconds since 1970-01-01 (Unix Epoch)', type: 'continuous', min: 0, max: 999999 },
  { format: 'minute', description: 'Minute of hour (0-59)', type: 'continuous', min: 0, max: 59 },
  { format: 'hours', description: 'Hour of day (0-23)', type: 'continuous', min: 0, max: 23 },
  { format: 'day', description: 'Day of month (1-31)', type: 'continuous', min: 1, max: 31 },
  { format: 'dow', description: 'Day of week Sunday-Saturday (0-6)', type: 'continuous', min: 0, max: 6 },
  { format: 'isodow', description: 'Day of week (ISO) Monday-Sunday (1-7)', type: 'continuous', min: 1, max: 7 },
  { format: 'doy', description: 'Day of year (1-366)', type: 'continuous', min: 1, max: 366 },
  { format: 'week', description: 'Week of year (ISO) (1-53)', type: 'continuous', min: 1, max: 53 },
  { format: 'month', description: 'Month of year (1-12)', type: 'continuous', min: 1, max: 12 },
  { format: 'quarter', description: 'Quarter of year (1-4)', type: 'continuous', min: 1, max: 4 },
  { format: 'year', description: 'Year', type: 'continuous', min: 1970, max: 2050 },
  { format: 'isoyear', description: 'Year (ISO)', type: 'continuous', min: 1970, max: 2050 },
  { format: 'decade', description: 'Decade', type: 'continuous', min: 197, max: 205 },
  { format: 'century', description: 'Century', type: 'continuous', min: 0, max: 30 },
  { format: 'millennium', description: 'Millennium', type: 'continuous', min: -3, max: 3 },
  { format: 'timezone_hour', description: 'Timezone hour component', min: -12, max: 12 },

  // String (categorial) parts
  {
    // TOOD
    format: 'AM',
    description: 'meridiem indicator',
    type: 'categorial',
    groups: []
  },
  {
    format: 'BC',
    description: 'era indicator',
    type: 'categorial',
    groups: ['AD', 'BC']
  },
  {
    format: 'MONTH',
    description: 'full upper case month name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['JANUARY  ', 'FEBURARY ', 'MARCH    ', 'APRIL    ', 'MAY      ', 'JUNE     ', 'JULY    ', 'AUGUST  ', 'SEPTEBMER', 'OCTOBER  ', 'NOVEMBER ', 'DECEMBER ']
  },
  {
    format: 'Month',
    description: 'full capitalized month name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['January  ', 'Feburary ', 'March    ', 'April    ', 'May      ', 'June     ', 'July    ', 'August  ', 'Septebmer', 'October  ', 'November ', 'December ']
  },
  {
    format: 'month',
    description: 'full lower case month name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['january  ', 'feburary ', 'march    ', 'april    ', 'may      ', 'june     ', 'july    ', 'august  ', 'septebmer', 'october  ', 'november ', 'december ']
  },
  {
    format: 'MON',
    description: 'abbreviated upper case month name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  },
  {
    format: 'Mon',
    description: 'abbreviated capitalized month name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  {
    format: 'mon',
    description: 'abbreviated lower case month name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  },
  {
    format: 'DAY',
    description: 'full upper case day name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['MONDAY   ', 'TUESDAY  ', 'WEDNESDAY', 'THURSDAY ', 'FRIDAY   ', 'SATURDAY ', 'SUNDAY   ']
  },
  {
    format: 'Day',
    description: 'full capitalized day name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['Monday   ', 'Tuesday  ', 'Wednesday', 'Thursday ', 'Friday   ', 'Saturday ', 'Sunday   ']
  },
  {
    format: 'day',
    description: 'full lower case day name (blank-padded to 9 chars)',
    type: 'categorial',
    groups: ['monday   ', 'tuesday  ', 'wednesday', 'thursday ', 'friday   ', 'saturday ', 'sunday   ']
  },
  {
    format: 'DY',
    description: 'abbreviated upper case day name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  },
  {
    format: 'Dy',
    description: 'abbreviated capitalized day name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  {
    format: 'dy',
    description: 'abbreviated lower case day name (3 chars in English, localized lengths vary)',
    type: 'categorial',
    groups: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  },
  {
    format: 'RM',
    description: 'month in upper case Roman numerals (I-XII; I=January)',
    type: 'categorial',
    groups: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  },
  {
    format: 'rm',
    description: 'month in lower case Roman numerals (i-xii; i=January)',
    type: 'categorial',
    groups: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
  }
];

var momentTimeParts = [
  {
    format: 'NONE',
    description: 'No change',
    type: 'datetime'
  },
  {
    format: 'M',
    description: 'Month (1-12)',
    type: 'continuous',
    min: 1,
    max: 12
  },
  {
    format: 'MMM',
    description: 'Month (Jan - Dec)',
    type: 'categorial',
    groups: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  {
    format: 'MMMM',
    description: 'Month (January - December)',
    type: 'categorial',
    groups: ['January', 'Feburary', 'March', 'April', 'May', 'June', 'July', 'August', 'Septebmer', 'October', 'November', 'December']
  },
  {
    format: 'Q',
    description: 'Quarter (1-4)',
    type: 'continuous',
    min: 1,
    max: 4
  },
  {
    format: 'D',
    description: 'Day of Month  (1-31)',
    type: 'continuous',
    min: 1,
    max: 31
  },
  {
    format: 'DDD',
    description: 'Day of Year (1-365)',
    type: 'continuous',
    min: 1,
    max: 365
  },
  {
    format: 'd',
    description: 'Day of Week (0-6)',
    type: 'continuous',
    min: 0,
    max: 6
  },
  {
    format: 'dd',
    description: 'Day of Week (Su-Sa)',
    type: 'categorial',
    groups: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  },
  {
    format: 'ddd',
    description: 'Day of Week (Sun-Sat)',
    type: 'categorial',
    groups: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  },
  {
    format: 'dddd',
    description: 'Day of Week (Sunday-Saturday)',
    type: 'categorial',
    groups: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  {
    format: 'E',
    description: 'Day of Week ISO (1-7)',
    type: 'continuous',
    min: 1,
    max: 7
  },
  {
    format: 'w',
    description: 'Week of Year (1-53)',
    type: 'continuous',
    min: 1,
    max: 53
  },
  {
    format: 'W',
    description: 'Week of Year ISO  (1-53)',
    type: 'continuous',
    min: 1,
    max: 53
  },
  {
    format: 'YY',
    description: 'Year last two digits',
    type: 'continuous',
    min: 0,
    max: 99
  },
  {
    format: 'Y',
    description: 'Year',
    type: 'continuous',
    calculate: true
  },
  {
    format: 'A',
    description: 'AM/PM',
    type: 'categorial',
    groups: ['AM', 'PM']
  },
  {
    format: 'H',
    description: 'Hour (0-23)',
    type: 'continuous',
    min: 0,
    max: 23
  },
  {
    format: 'h',
    description: 'Hour (1-12)',
    type: 'continuous',
    min: 1,
    max: 12
  },
  {
    format: 'm',
    description: 'Minute (0-59)',
    type: 'continuous',
    min: 0,
    max: 59
  },
  {
    format: 's',
    description: 'Second (0-59)',
    type: 'continuous',
    min: 0,
    max: 59
  },
  {
    format: 'SSS',
    description: 'Milliseconds (0-999)',
    type: 'continuous',
    min: 0,
    max: 999
  },
  {
    format: 'SSSSSS',
    description: 'microseconds (0-999999)',
    type: 'continuous',
    min: 0,
    max: 999999
  },
  {
    format: 'X',
    description: 'Unix Timestamp',
    type: 'continuous',
    calculate: true
  }
];

var momentDurationUnits = [
  {
    description: 'years',
    format: 'years',
    seconds: 365.25 * 24 * 60 * 60
  },
  {
    description: 'months',
    format: 'months',
    seconds: 30 * 24 * 60 * 60
  },
  {
    description: 'weeks',
    format: 'weeks',
    seconds: 7 * 24 * 60 * 60
  },
  {
    description: 'days',
    format: 'days',
    seconds: 24 * 60 * 60
  },
  {
    description: 'hours',
    format: 'hours',
    seconds: 60 * 60
  },
  {
    description: 'minutes',
    format: 'minutes',
    seconds: 60
  },
  {
    description: 'seconds',
    format: 'seconds',
    seconds: 1
  },
  {
    description: 'milliseconds',
    format: 'milliseconds',
    seconds: 0.001
  }
];

var TimeZone = AmpersandModel.extend({
  props: {
    /**
     * The descriptive name of the time zone
     * @memberof! TimeZone
     * @type {string}
     */
    description: ['string'],
    /**
     * The time zone format
     * @memberof! TimeZone
     * @type {string}
     */
    format: ['string']
  }
});

var TimePart = AmpersandModel.extend({
  props: {
    /**
     * The format string
     * @memberof! TimePart
     * @type {string}
     */
    format: ['string', true],
    /**
     * The human readable descprition of the datetime part
     * @memberof! TimePart
     * @type {string}
     */
    description: ['string', true],
    /**
     * Data type after conversion: 'continuous', or 'categorial'
     * @memberof! TimePart
     * @type {string}
     */
    type: ['string', true],
    /**
     * For continuous datetime parts (ie, day-of-year), the minimum value
     * @memberof! TimePart
     * @type {number}
     */
    min: ['number', true, 0],
    /**
     * For continuous datetime parts (ie, day-of-year), the maximum value
     * @memberof! TimePart
     * @type {number}
     */
    max: ['number', true, 1],
    /**
     * When true, calculate the minimum and maximum value from the
     * original datetime limits. Used for continuous datetime parts (ie, year)
     * @memberof! TimePart
     * @type {boolean}
     */
    calculate: ['boolean', true, false],
    /**
     * For categorial datetime parts (Mon, Tue, ..), the array of possible values
     * @memberof! TimePart
     * @type {String[]}
     */
    groups: ['array']
  }
});

var DurationUnit = AmpersandModel.extend({
  props: {
    /**
     * The descriptive name of the time zone
     * @memberof! TimeZone
     * @type {string}
     */
    description: ['string'],
    /**
     * The time zone format
     * @memberof! TimeZone
     * @type {string}
     */
    format: ['string'],
    /**
     * Conversion factor to seconds
     * @memberof! TimeZone
     * @type {string}
     */
    seconds: ['number']
  }
});

var TimeParts = AmpersandColllection.extend({
  model: TimePart,
  indexes: ['format']
});

var TimeZones = AmpersandColllection.extend({
  model: TimeZone
});

var DurationUnits = AmpersandColllection.extend({
  indexes: ['format'],
  model: DurationUnit
});

var timeZones = new TimeZones();
timeZones.add({
  description: 'No change',
  format: 'NONE'
});

moment.tz.names().forEach(function (tz) {
  timeZones.add({
    description: tz,
    format: tz
  });
});

var clientTimeParts = new TimeParts(momentTimeParts);
var serverTimeParts = new TimeParts(postgresTimeParts);

module.exports = {
  getTimeParts: function () {
    if (app && app.me && app.me.dataset) {
      if (app.me.dataset.datasetType === 'client') {
        return clientTimeParts;
      } else if (app.me.dataset.datasetType === 'server') {
        return serverTimeParts;
      } else {
        console.error('Unknonwn dataset type');
      }
    } else {
      // fallback to client (moment js) timeParts
      return clientTimeParts;
    }
  },
  timeZones: timeZones,
  durationUnits: new DurationUnits(momentDurationUnits),
  getResolution: getResolution,
  getFormat: getFormat
};