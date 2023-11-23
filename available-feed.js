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
  a,
  b,
} = require("@saltcorn/markup/tags");

const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const {
  InvalidConfiguration,
  isNode,
  isWeb,
  mergeConnectedObjects,
  hashState,
} = require("@saltcorn/data/utils");
const {
  link_view,
  stateToQueryString,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
} = require("@saltcorn/data/plugin-helper");
const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = table.fields;
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: req.__("Views"),
        form: async (context) => {
          const table = Table.findOne(context.table_id);
          const fields = table.fields;

          const reservable_entity_fields = fields.filter((f) => f.is_fkey);
          const show_view_opts = {};
          for (const rfield of reservable_entity_fields) {
            const retable = Table.findOne(rfield.reftable_name);
            const show_views = await View.find_table_views_where(
              retable.id,
              ({ state_fields, viewtemplate, viewrow }) =>
                viewtemplate.runMany &&
                viewrow.name !== context.viewname &&
                state_fields.some((sf) => sf.name === "id")
            );
            show_view_opts[rfield.name] = show_views.map((v) => v.name);
          }
          return new Form({
            fields: [
              {
                name: "reservable_entity_key",
                label: "Key to reservable entity",
                type: "String",
                required: true,
                attributes: {
                  options: reservable_entity_fields.map((f) => f.name),
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
                name: "end_field",
                label: "End date field",
                type: "String",
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
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Integer")
                    .map((f) => f.name),
                },
              },
              {
                name: "show_view",
                label: req.__("Single item view"),
                type: "String",
                sublabel:
                  req.__("The underlying individual view of each table row") +
                  ". " +
                  a(
                    {
                      "data-dyn-href": `\`/viewedit/config/\${show_view}\``,
                      target: "_blank",
                    },
                    req.__("Configure")
                  ),
                required: true,
                attributes: {
                  calcOptions: ["reservable_entity_key", show_view_opts],
                },
              },
            ],
          });
        },
      },
    ],
  });

const run = async (
  table_id,
  viewname,
  { reservable_entity_key, start_field, end_field, duration_field, show_view },
  state,
  extraArgs
) => {
  const restable = Table.findOne({ id: table_id });
  const resfields = restable.getFields();

  const refield = restable.getField(reservable_entity_key);
  const retable = Table.findOne(refield.reftable_name);

  const state_re = { ...state };
  const state_res = { ...state };

  readState(state_re, retable.fields);

  const sview = await View.findOne({ name: show_view });
  if (!sview)
    throw new InvalidConfiguration(
      `View ${viewname} incorrectly configured: cannot find view ${show_view}`
    );
  const q = await stateFieldsToQuery({
    state: state_re,
    fields: retable.fields,
  });
  let qextra = {};

  const sresp = await sview.runMany(state, {
    ...extraArgs,
    ...qextra,
  });
  const showRow = (r) => r.html;
  return div(sresp.map(showRow));
};

module.exports = {
  name: "Available Resources Feed",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
};
