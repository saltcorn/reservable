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
                    sublabel: "Optional tname of this service",
                    type: "String",
                  },
                  {
                    name: "duration",
                    label: "Duration (minutes)",
                    sublabel: "Optional name of this service",
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

const run = async (
  table_id,
  viewname,
  { show_view, order_field, descending },
  all_state,
  extraArgs
) => {
  const id = `map${Math.round(Math.random() * 100000)}`;
  const { _offset, ...state } = all_state;
  const tbl = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
  const qstate = await stateFieldsToWhere({ fields, state });
  const nrows = await tbl.countRows(qstate);

  const offset = typeof _offset === "undefined" ? 0 : +_offset;
  var hasNext = offset < nrows - 1;
  var hasPrev = offset > 0;

  const showview = await View.findOne({ name: show_view });
  if (!showview)
    return div(
      { class: "alert alert-danger" },
      "Stepper incorrectly configured. Cannot find view: ",
      show_view
    );

  const sresps = await showview.runMany(state, {
    ...extraArgs,
    orderBy: order_field,
    ...(descending && { orderDesc: true }),
    limit: 1,
    offset,
  });

  return div(
    sresps.length > 0 ? sresps[0].html : "Nothing to see here",
    div(
      { class: "d-flex justify-content-between" },

      button(
        {
          disabled: !hasPrev,
          class: "btn btn-secondary",
          onClick: `set_state_field('_offset',${offset - 1})`,
        },
        "&laquo Previous"
      ),
      div(`${offset + 1} / ${nrows}`),
      button(
        {
          disabled: !hasNext,
          class: "btn btn-secondary",
          onClick: `set_state_field('_offset',${offset + 1})`,
        },
        "Next &raquo"
      )
    )
  );
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
