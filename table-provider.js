const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const PlainDate = require("@saltcorn/plain-date");

const { get_available_slots, range } = require("./common");

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "table",
        form: async () => {
          const tables = await Table.find({});
          return new Form({
            fields: [
              {
                name: "table_name",
                label: "Reservations Table",
                type: "String",
                required: true,
                attributes: {
                  options: tables.map((t) => t.name),
                },
                sublabel: "Select a table with reservations",
              },
            ],
          });
        },
      },
      {
        name: "fields",
        form: async (context) => {
          const table = await Table.findOne({ name: context.table_name });
          const fields = await table.getFields();

          return new Form({
            fields: [
              {
                name: "reservable_entity_key",
                label: "Key to reservable entity",
                type: "String",
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
            ],
          });
        },
      },
      {
        name: "services",
        form: async () => {
          return new Form({
            fields: [
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
      {
        name: "availability",
        form: async () => {
          return new Form({
            fields: [
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
            ],
          });
        },
      },
    ],
  });

module.exports = {
  configuration_workflow,
  fields: (cfg) => {
    if (!cfg?.table_name) return [];

    const table = Table.findOne({ name: cfg.table_name });
    let entity_key;
    if (cfg.reservable_entity_key) {
      entity_key = table.getField(cfg.reservable_entity_key);
    }
    return [
      {
        name: "reserve_ident",
        type: "String",
        primary_key: true,
        is_unique: true,
      },
      {
        name: "start_day",
        label: "Start day",
        type: "Date",
        attributes: { day_only: true },
      },
      {
        name: "start_date",
        label: "Start date",
        type: "Date",
      },
      {
        name: "start_hour",
        label: "Start hour",
        type: "Integer",
        attributes: { min: 0, max: 23 },
      },
      {
        name: "start_minute",
        label: "Start mintute",
        type: "Integer",
        attributes: { min: 0, max: 59 },
      },
      {
        name: "service",
        label: "Service",
        type: "String",
        attributes: { options: cfg.services.map((s) => s.title) },
      },
      {
        name: "service_duration",
        label: "Duration",
        type: "Integer",
      },
      ...(entity_key
        ? [
            {
              name: "entity",
              label: "Entity",
              type: `Key to ${entity_key.reftable_name}`,
              attributes: {
                summary_field: entity_key.attributes.summary_field,
              },
            },
          ]
        : []),
    ];
  },
  get_table: (cfg) => {
    return {
      disableFiltering: true,
      getRows: async (where, opts) => {
        const table = Table.findOne({ name: cfg.table_name });
        const date = !where?.start_day
          ? new Date()
          : where?.start_day.constructor.name === "PlainDate"
          ? where.start_day.toDate()
          : new Date(where?.start_day);

        const services = where?.service
          ? cfg.services.filter((s) => s.title === where.service)
          : cfg.services;
        const { available_slots, from, durGCD, taken_slots } =
          await get_available_slots({
            table,
            date,
            availability: cfg.availability,
            entity_wanted: where?.entity || undefined,
            reservable_entity_key: cfg.reservable_entity_key,
            start_field: cfg.start_field,
            duration_field: cfg.duration_field,
            services,
          });
        const minSlot = Math.min(...Object.keys(available_slots));
        const maxSlot = Math.max(...Object.keys(available_slots));
        const service_availabilities = services.map((service, serviceIx) => {
          const nslots = service.duration / durGCD;
          const availabilities = [];
          for (let i = minSlot; i <= maxSlot; i++) {
            const mins_since_midnight = i * durGCD;
            const hour = Math.floor(mins_since_midnight / 60);

            const minute = mins_since_midnight - hour * 60;
            const date1 = new Date(date);
            date1.setHours(hour);
            date1.setMinutes(minute);
            date1.setSeconds(0);
            date1.setMilliseconds(0);
            if (date1 > new Date())
              if (range(nslots, i).every((j) => available_slots[j])) {
                availabilities.push({
                  date: date1,
                  available: true,
                });
              } else {
                availabilities.push({
                  date: date1,
                  available: false,
                });
              }
          }
          //console.log({ availabilities, service });
          return { availabilities, service, serviceIx };
        });

        const rows = service_availabilities
          .map(({ availabilities, service, serviceIx }) =>
            availabilities
              .filter((a) => a.available)
              .map(({ date }) => {
                return {
                  reserve_ident: `${date.toISOString()}//${service.title}`,
                  service: service.title,
                  service_duration: service.duration,
                  start_day: new PlainDate(date),
                  start_date: date,
                  start_hour: date.getHours(),
                  start_minute: date.getMinutes(),
                };
              })
          )
          .flat();
        return rows;
      },
    };
  },
};
