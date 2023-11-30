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
          const slots_available_field = {};
          const distinct_slot_fields = new Set();
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
            slots_available_field[rfield.name] = retable.fields
              .filter((f) => f.type?.name === "Integer")
              .map((f) => f.name);
            slots_available_field[rfield.name].forEach((v) =>
              distinct_slot_fields.add(v)
            );
            slots_available_field[rfield.name].unshift("");
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
                name: "valid_field",
                label: "Valid reservation field",
                sublabel: "Only consider reservations with this field valid",
                type: "String",
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Bool")
                    .map((f) => f.name),
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
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name),
                },
              },
              /*{
                name: "duration_field",
                label: "Duration field",
                sublabel: "Integer field holding booked duration in minutes",
                type: "String",
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Integer")
                    .map((f) => f.name),
                },
              }, */
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
              {
                name: "slots_available_field",
                label: "Slots available field",
                sublabel:
                  "Field with a number of available instances of the reservable entity. If blank, treat as one per entity.",
                type: "String",
                attributes: {
                  calcOptions: ["reservable_entity_key", slots_available_field],
                },
              },
              {
                name: "slot_count_field",
                label: "Slots taken field",
                sublabel:
                  "Field with the number of entities reserved. If blank, treat as one per entity.",
                type: "String",
                showIf: { slots_available_field: [...distinct_slot_fields] },
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
    ],
  });

const first = (xs) => (Array.isArray(xs) ? xs[0] : xs);

const run = async (
  table_id,
  viewname,
  {
    reservable_entity_key,
    valid_field,
    slot_count_field,
    slots_available_field,
    show_view,
    start_field,
    end_field,
  },
  state,
  extraArgs
) => {
  const restable = Table.findOne({ id: table_id });
  const resfields = restable.getFields();

  const refield = restable.getField(reservable_entity_key);
  const retable = Table.findOne(refield.reftable_name);

  const state_res = { ...state };

  readState(state_res, restable.fields);

  //get reservations
  const reswhere = await stateFieldsToWhere({
    fields: resfields,
    state: state_res,
    table: restable,
  });

  if (valid_field) reswhere[valid_field] = true;
  const reservations = await restable.getRows(reswhere);
  const use_slots = slot_count_field || slots_available_field;
  const sview = await View.findOne({ name: show_view });
  if (!sview)
    throw new InvalidConfiguration(
      `View ${viewname} incorrectly configured: cannot find view ${show_view}`
    );
  const srespAll = await sview.runMany(state, extraArgs);
  const srespsAvailable = [];

  if (!use_slots) {
    const resEnts = new Set(reservations.map((r) => r[reservable_entity_key]));
    for (const sresp of srespAll) {
      if (!resEnts.has(sresp.row[retable.pk_name])) srespsAvailable.push(sresp);
    }
  } else {
    //console.log("state_res", state_res);
    //console.log("reswhere", reswhere);
    const to = new Date(first(reswhere[start_field])?.lt);
    const from = new Date(first(reswhere[end_field])?.gt);
    if (!from || !to) srespsAvailable.push(...srespAll);
    else
      for (const sresp of srespAll) {
        const myreservations = reservations.filter(
          (r) => r[reservable_entity_key] === sresp.row[retable.pk_name]
        );
        /*console.log({
        taken: resEnts[sresp.row[retable.pk_name]] || 0,
        available: sresp.row[slots_available_field],
      });*/
        const to = new Date(first(reswhere[start_field])?.lt);
        const from = new Date(first(reswhere[end_field])?.gt);
        let maxAvailable = sresp.row[slots_available_field];
        for (let day = from; day <= to; day.setDate(day.getDate() + 1)) {
          const active = myreservations.filter(
            (r) => r[start_field] <= day && r[end_field] >= day
          );
          const taken = active
            .map((r) => r[slot_count_field] || 1)
            .reduce((a, b) => a + b, 0);
          maxAvailable = Math.min(
            maxAvailable,
            sresp.row[slots_available_field] - taken
          );
          //console.log({ car: sresp.row.name, day, maxAvailable });
        }
        if (maxAvailable > 0) srespsAvailable.push(sresp);
      }
  }
  const showRow = (r) => r.html;
  return div(srespsAvailable.map(showRow));
};

module.exports = {
  name: "Available Resources Feed",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
};
