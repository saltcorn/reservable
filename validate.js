const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");

module.exports = {
  configFields: async ({ table }) => {
    const views = await View.find({
      viewtemplate: "Available Resources Feed",
      table_id: table.id,
    });
    const tables = await Table.find(
      {
        provider_name: "Reservation availabilites",
      },
      {
        cached: true,
      }
    );
    const neither = views.length === 0 && tables.length === 0;
    //console.log({ views, tables, neither });

    return [
      ...(views.length || neither
        ? [
            {
              name: "feedview",
              label: "View",
              sublabel: `A view on table ${table.name} with pattern: Available Resources Feed`,
              type: "String",
              attributes: {
                options: views.map((f) => f.name),
              },
            },
          ]
        : []),
      ...(tables.length || neither
        ? [
            {
              name: "reserve_provided_table",
              label: "Table",
              sublabel: `A table with provider: Reservation availabilites`,
              type: "String",
              attributes: {
                options: tables.map((f) => f.name),
              },
            },
          ]
        : []),
    ];
  },
  requireRow: true,
  run: async ({
    table,
    req,
    row,
    configuration: { feedview, reserve_provided_table },
  }) => {
    const get_config = () => {
      if (feedview) {
        const view = View.findOne({ name: feedview });
        return view.configuration;
      } else if (reserve_provided_table) {
        const table = Table.findOne({ name: reserve_provided_table });
        return table.provider_cfg;
      }
    };
    const {
      reservable_entity_key,
      valid_field,
      slot_count_field,
      slots_available_field,
      start_field,
      end_field,
      duration_field,
    } = get_config();
    //get all relevant reservations

    //get entity
    let entity;
    if (reservable_entity_key) {
      const refield = table.getField(reservable_entity_key);
      const retable = Table.findOne(refield.reftable_name);
      entity = await retable.getRow({
        [retable.pk_name]:
          row[reservable_entity_key]?.id || row[reservable_entity_key],
      });
    }
    if (end_field) {
      const q = valid_field ? { [valid_field]: true } : {};
      if (end_field) {
        q[start_field] = { lt: row[end_field], equal: true, day_only: true };
        q[end_field] = { gt: row[start_field], equal: true, day_only: true };
      } else {
        q[start_field] = {
          lt: row[start_field],
          gt: row[start_field],
          equal: true,
          day_only: true,
        };
      }
      if (reservable_entity_key)
        q[reservable_entity_key] =
          row[reservable_entity_key]?.id || row[reservable_entity_key];
      //console.log("q", q);

      const ress = await table.getRows(q);

      //check that for every day, there is availablity
      const from = new Date(row[start_field]);
      const to = new Date(row[end_field]);
      let maxAvailable =
        slots_available_field && entity ? entity[slots_available_field] : 1;
      // loop for every day
      for (let day = from; day <= to; day.setDate(day.getDate() + 1)) {
        // your day is here
        const active = ress.filter(
          (r) => r[start_field] <= day && r[end_field] >= day
        );
        const taken = active
          .map((r) => (slot_count_field ? r[slot_count_field] : 1))
          .reduce((a, b) => a + b, 0);
        maxAvailable = Math.min(
          maxAvailable,
          (slots_available_field && entity
            ? entity[slots_available_field]
            : 1) - taken
        );
      }
      if (maxAvailable < (slot_count_field ? row[slot_count_field] : 1))
        return maxAvailable === 1
          ? { error: `Not available` }
          : { error: `Only ${maxAvailable} are available` };
    } else if (reserve_provided_table) {
      const { get_table } = require("./table-provider");
      const table = Table.findOne({ name: reserve_provided_table });
      const ptable = get_table(table.provider_cfg);
      const q = {};
      if (entity) q.entity = entity.id; //todo pk_name
      q.start_day = row[start_field];
      const rows = await ptable.getRows(q);
      const start_hr = new Date(row[start_field]).getHours()
      const start_min = new Date(row[start_field]).getMinutes()
      if (
        !rows.find(
          (r) =>
            r.start_hour === start_hr &&
            r.start_minute === start_min &&
            r.service_duration >= row[duration_field]
        )
      )
        return { error: `Not available` };
    }
  },
};
