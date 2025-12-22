const gcd = function (a, b) {
  if (!b) {
    return a;
  }

  return gcd(b, a % b);
};

let gcdArr = function (arr) {
  let gcdres = gcd(arr[0], arr[1]);
  for (let i = 2; i < arr.length; i++) {
    gcdres = gcd(gcdres, arr[i]);
  }
  return gcdres;
};

function range(size, startAt = 0) {
  return [...Array(size).keys()].map((i) => i + startAt);
}

const get_available_slots = async ({
  table,
  availability,
  date,
  entity_wanted,
  reservable_entity_key,
  services,
  start_field,
  duration_field,
}) => {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  const q = {};
  q[start_field] = [{ gt: from }, { lt: to }];
  if (reservable_entity_key && entity_wanted)
    q[reservable_entity_key] = entity_wanted;
  //console.log(JSON.stringify({ date, q }, null, 2));
  const taken_slots = await table.getRows(q);

  // figure out regular availability for this day
  const dayOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][date.getDay()];
  const relevant_availabilities = availability.filter(
    ({ day }) =>
      day === dayOfWeek ||
      (day === "Mon-Fri" && !["Saturday", "Sunday"].includes(dayOfWeek))
  );

  const available_slots = [];
  const durGCD = gcdArr(services.map((s) => s.duration));
  relevant_availabilities.forEach(({ from, to }) => {
    for (let i = (from * 60) / durGCD; i < (to * 60) / durGCD; i++) {
      available_slots[i] = true;
    }
  });
  //console.log({ taken_slots });
  taken_slots.forEach((slot) => {
    /*    console.log(
      "taken slot",
      slot,
      slot[start_field].getHours(),
      slot[start_field].getTimezoneOffset()
    ); */
    const from =
      slot[start_field].getHours() * 60 + slot[start_field].getMinutes();
    const to = from + slot[duration_field];
    for (let i = from / durGCD; i < to / durGCD; i++) {
      available_slots[i] = false;
    }
  });
  return { available_slots, from, durGCD, taken_slots };
};

module.exports = { get_available_slots, range };
