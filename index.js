const {
  input,
  div,
  text,
  script,
  domReady,
  style,
  button,
} = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const db = require("@saltcorn/data/db");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          // reservation table
          // number of concurrent slots
          // slot duration - fixed or max/min
          // form for reservation
          // availability: regular + blocking table. no table in v1

          return new Form({
            fields: [
              {
                name: "reservable_entity_key",
                label: "Key to reservable entity",
                type: "String",
                required: true,
                attributes: {
                  options: fields.filter((f) => f.is_fkey).map((f) => f.name),
                },
              },
              {
                name: "start_field",
                label: "Start date field",
                type: "String",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name),
                },
              },
              {
                name: "duration_field",
                label: "Duration field",
                sublabel: "Integer field holding booked duration in minutes",
                type: "String",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Integer")
                    .map((f) => f.name),
                },
              },
              new FieldRepeat({
                name: "availability",
                fields: [
                  {
                    name: "day",
                    label: "Day of week",
                    type: "String",
                    required: true,
                    attributes: {
                      options:
                        "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday,Mon-Fri",
                    },
                  },
                  {
                    name: "from",
                    label: "Start hour",
                    type: "Integer",
                    required: true,
                    attributes: {
                      min: 0,
                      max: 23,
                    },
                  },
                  {
                    name: "to",
                    label: "End hour",
                    type: "Integer",
                    required: true,
                    attributes: {
                      min: 0,
                      max: 24,
                    },
                  },
                ],
              }),
              new FieldRepeat({
                name: "services",
                fields: [
                  {
                    name: "title",
                    label: "Title",
                    sublabel: "Optional name of this service",
                    type: "String",
                  },
                  {
                    name: "duration",
                    label: "Duration (minutes)",
                    type: "Integer",
                    attributes: {
                      min: 0,
                    },
                  },
                ],
              }),
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields.map((f) => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};
const gcd = function (a, b) {
  if (!b) {
    return a;
  }

  return gcd(b, a % b);
};

let gcdArr = function (arr) {
  let gcdres = gcd(arr[0], arr[1]);
  for (let i = 3; i < arr.length; i++) {
    gcdres = gcd(gcdres, arr[i]);
  }
  return gcdres;
};

const run = async (
  table_id,
  viewname,
  {
    reservable_entity_key,
    start_field,
    duration_field,
    availability,
    services,
  },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
  const entity_wanted = state[reservable_entity_key];
  const date = new Date(); //todo from state

  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  const q = {};
  q[start_field] = [{ gt: from }, { lt: to }];
  if (entity_wanted) q[reservable_entity_key] = entity_wanted;
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
  taken_slots.forEach((slot) => {
    const from =
      slot[start_field].getHours() * 60 + slot[start_field].getMinutes();
    const to = from + slot[duration_field];
    for (let i = from / durGCD; i < to / durGCD; i++) {
      available_slots[i] = false;
    }
  });
  const minSlot = Math.min(...Object.keys(available_slots))
  const maxSlot = Math.max(...Object.keys(available_slots))
};

module.exports = {
  sc_plugin_api_version: 1,
  viewtemplates: [
    {
      name: "Reserve",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run,
    },
  ],
};
