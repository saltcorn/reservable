const {
  input,
  div,
  text,
  script,
  domReady,
  style,
  button,
  h3,
  ul,
  li,
  form,
} = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const db = require("@saltcorn/data/db");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");
const { renderForm, localeHourMinute } = require("@saltcorn/markup");
const { InvalidConfiguration } = require("@saltcorn/data/utils");
const {
  getForm,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
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
          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.some((sf) => sf.name === "id")
          );
          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewtemplate.name === "Edit" &&
              viewrow.name !== context.viewname &&
              state_fields.every((sf) => !sf.required)
          );
          const show_view_opts = show_views.map((v) => v.select_option);
          const create_view_opts = create_views.map((v) => v.select_option);
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
              {
                name: "view_to_create",
                label: "Use view to create reservation",
                type: "String",
                attributes: {
                  options: create_view_opts,
                },
              },
              {
                name: "confirmation_view",
                label: "Confirmed reservation view",
                type: "String",
                required: true,
                attributes: {
                  options: show_view_opts,
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

function range(size, startAt = 0) {
  return [...Array(size).keys()].map((i) => i + startAt);
}

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
  { req, res }
) => {
  const table = await Table.findOne({ id: table_id });
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
  console.log({ taken_slots });
  taken_slots.forEach((slot) => {
    console.log(
      "taken slot",
      slot,
      slot[start_field].getHours(),
      slot[start_field].getTimezoneOffset()
    );
    const from =
      slot[start_field].getHours() * 60 + slot[start_field].getMinutes();
    const to = from + slot[duration_field];
    for (let i = from / durGCD; i < to / durGCD; i++) {
      available_slots[i] = false;
    }
  });
  const minSlot = Math.min(...Object.keys(available_slots));
  const maxSlot = Math.max(...Object.keys(available_slots));
  const service_availabilities = services.map((service, serviceIx) => {
    const nslots = service.duration / durGCD;
    const availabilities = [];
    for (let i = minSlot; i <= maxSlot; i++) {
      if (range(nslots, i).every((j) => available_slots[j])) {
        const mins_since_midnight = i * durGCD;
        const hour = Math.floor(mins_since_midnight / 60);

        const minute = mins_since_midnight - hour * 60;
        const date = new Date();
        date.setHours(hour);
        date.setMinutes(minute);
        date.setSeconds(0)
        date.setMilliseconds(0)
        
        availabilities.push({
          hour,
          minute,
          date,
        });
      }
    }
    console.log({ availabilities, service });
    return { availabilities, service, serviceIx };
  });
  return div(
    service_availabilities.map(({ availabilities, service, serviceIx }) =>
      div(
        h3(service.title || `${service.duration} minutes`),
        ul(
          availabilities.map(({ hour, minute, date }) =>
            reserve_btn({ viewname, hour, minute, service, date, serviceIx, req })
          )
        )
      )
    )
  );
};

const reserve_btn = ({
  viewname,
  hour,
  minute,
  date,
  service,
  serviceIx,
  req,
}) =>
  form(
    { action: `/view/${viewname}`, method: "post" },
    input({ type: "hidden", name: "_csrf", value: req.csrfToken() }),
    input({ type: "hidden", name: "hour", value: hour }),
    input({ type: "hidden", name: "minute", value: minute }),
    input({ type: "hidden", name: "serviceIx", value: serviceIx }),
    input({ type: "hidden", name: "step", value: "getReservationForm" }),

    button(
      { type: "submit", class: "btn btn-primary mt-2" },
      localeHourMinute(date)
      //  `${hour}:${String(minute).padStart(2, "0")}`
    )
  );
const getReservationForm = async ({ table, viewname, config, body, req }) => {
  const {
    view_to_create,
    reservable_entity_key,
    start_field,
    duration_field,
    services,
  } = config;
  const view = await View.findOne({ name: view_to_create });
  if (!view)
    throw new InvalidConfiguration("View to create reservation does not exist");
  const { columns, layout } = view.configuration;
  const form = await getForm(table, viewname, columns, layout, null, req);
  form.hidden(start_field, duration_field, "step");
  return form;
};
const makeReservation = async ({ table, viewname, config, body, req, res }) => {
  const form = await getReservationForm({
    table,
    viewname,
    config,
    body,
    req,
  });
  form.validate(body);
  const { step, ...row } = form.values;
  console.log({row});
  const ins_res = await table.tryInsertRow(
    row,
    req.user ? +req.user.id : undefined
  );
  const id = ins_res.success;
  const confirmation_view = await View.findOne({
    name: config.confirmation_view,
  });
  console.log({ ins_res });
  return await confirmation_view.run_possibly_on_page({ id }, req, res);
};
const runPost = async (
  table_id,
  viewname,
  config,
  state,
  body,
  { res, req }
) => {
  const table = await Table.findOne({ id: table_id });

  if (body.step === "getReservationForm") {
    const form = await getReservationForm({
      table,
      viewname,
      config,
      body,
      req,
    });
    const startDate = new Date();
    startDate.setHours(+body.hour);
    startDate.setMinutes(+body.minute);
    console.log({ startDate, body });
    form.values = {
      [config.start_field]: startDate.toISOString(),
      [config.duration_field]: config.services[+body.serviceIx].duration,
      step: "makeReservation",
    };

    res.sendWrap(viewname, renderForm(form, req.csrfToken()));
  } else if (body.step === "makeReservation") {
    const something = await makeReservation({
      table,
      viewname,
      config,
      body,
      req,
      res,
    });
    res.sendWrap(viewname, something);
  }
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
      runPost,
    },
  ],
};

/*
TODO

-tz
-pick day
-pick entity
-check availabilty in make reservation
-services is table
-offers_service is table

*/
