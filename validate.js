const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");

module.exports = {
  configFields: async ({ table }) => {
    const views = await View.find({
      viewtemplate: "Available Resources Feed",
      table_id: table.id,
    });
    console.log({ views });
    return [
      {
        name: "feedview",
        label: "View",
        sublabel: `A view on table ${table.name} with pattern: Available Resources Feed`,
        type: "String",
        required: true,
        attributes: {
          options: views.map((f) => f.name),
        },
      },
    ];
  },
  requireRow: true,
  run: async ({ table, req, row, configuration: { feedview } }) => {
    const view = View.findOne({ name: feedview });
    const {
      reservable_entity_key,
      valid_field,
      slot_count_field,
      slots_available_field,
      show_view,
      start_field,
      end_field,
    } = view.configuration;
    //get all relevant reservations

    const ress = await table.getRows({
      [reservable_entity_key]: row[reservable_entity_key],
      [start_field]: { lt: row[end_field], equal: true, day_only: true },
      [end_field]: { gt: row[start_field], equal: true, day_only: true },
      ...(valid_field ? { [valid_field]: true } : {}),
    });

    //get entity
    const refield = table.getField(reservable_entity_key);
    const retable = Table.findOne(refield.reftable_name);
    const entity = await retable.getRow({
      [retable.pk_name]: row[reservable_entity_key],
    });
    //check that for every day, there is availablity
    const from = new Date(row[start_field]);
    const to = new Date(row[end_field]);
    let maxAvailable = entity[slots_available_field];
    // loop for every day
    for (let day = from; day <= to; day.setDate(day.getDate() + 1)) {
      // your day is here
      const active = ress.filter(
        (r) => r[start_field] <= day && r[end_field] >= day
      );
      const taken = active
        .map((r) => r[slot_count_field])
        .reduce((a, b) => a + b, 0);
      maxAvailable = Math.min(
        maxAvailable,
        entity[slots_available_field] - taken
      );
    }
    if (maxAvailable < row[slot_count_field])
      return { error: `Only ${maxAvailable} are available` };
  },
};
