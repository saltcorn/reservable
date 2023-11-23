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
          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewtemplate.runMany &&
              viewrow.name !== context.viewname &&
              state_fields.some((sf) => sf.name === "id")
          );
          const show_view_opts = show_views.map((v) => v.select_option);

          return new Form({
            fields: [
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
                  options: show_view_opts,
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
  { show_view },
  state,
  extraArgs,
  { countRowsQuery }
) => {
  const table = Table.findOne({ id: table_id });
  const fields = table.getFields();
  const state1 = { ...state };
  readState(state1, fields);

  const sview = await View.findOne({ name: show_view });
  if (!sview)
    throw new InvalidConfiguration(
      `View ${viewname} incorrectly configured: cannot find view ${show_view}`
    );
  const q = await stateFieldsToQuery({ state, fields });
  let qextra = {};

  const sresp = await sview.runMany(state, {
    ...extraArgs,
    ...qextra,
  });
  const showRow = (r) => r.html;
  return div(sresp.map(showRow));
};

module.exports = {
  name: "AvailableResourcesFeed",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
};
