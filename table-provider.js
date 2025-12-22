const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");

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
          const table = await Table.findOne({ id: context.table_name });
          const fields = await table.getFields();

          return new Form({
            fields: [
              {
                name: "",
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
  "Reservation availabilites": {
    configuration_workflow,
    fields: (cfg) => {
      if (!cfg?.table) return [];

      const table = Table.findOne({ name: cfg.table });
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
          name: "start_hour",
          label: "Start hour",
          type: "Integer",
        },
        {
          name: "start_minute",
          label: "Start mintute",
          type: "Integer",
        },
        { name: "Service", label: "Version", type: "String" },
        ...(entity_key
          ? [
              {
                name: "entity",
                label: "Entity",
                type: `Key to ${entity_key.reftable_name}`,
              },
            ]
          : []),
      ];
    },
    get_table: (cfg) => {
      return {
        getRows: async (where, opts) => {
          const table = Table.findOne({ name: cfg.table_name });
          const qres = await runQuery(table, where, opts);
          return qres.rows;
        },
      };
    },
  },
};
