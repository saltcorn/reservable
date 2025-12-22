# reservable - Reservation system for Saltcorn

To use this Plugin, you should create a table for reservations. This table should have the following fields:

- A Date field for the time of the start of the reservation
- An integer field for the duration of the reservation in minutes
- Any other fields for the reservation, for instance the email of the person reserving the slot

This table also needs to have two views

- A view to create, typically an Edit view obtain the information required for the booking.
  This Edit view does not need to have fields for the date or the duration.
- A confirmation view, typically a Show view, which is displayed to the user on a successful reservation.
  This may or may not contain Date and duration

There may be another table indicating reservable resources. This is optional. If you are building a reservation system
for a single resource, you can leave this out. On the other hand, if you are building a system where multiple resources
need to be tracked for whether they are available, use this to denote the resources that can be taken/available.
To do this, create a foreign key field on your reservations Table to the reservable resource table.



### Example

Goldilocks and Rapunzel together run the successful GoldiRap Hair Salon. In fact they are so successful that
they must now implement an online booking system. Their opening hours are Monday to Friday 9-12 and 13-17
(they close for lunch) and Saturday 10-13. They offer two services: A haircut taking 30 minutes
and a full restyle taking 45 minutes. You can book either Goldilocks or Rapunzel for each of the services.

Here, the reservable resource is the hairdresser with two rows: Goldilocks and Rapunzel. They have two services,
haircut and full restyle. The availability can be specified as: Mon-Fri 9-12, Mon-Fri 13-17 and Saturday 10-13.

### Using Reserve view

The reserve view is a quick way to get started but offers limited control over the look and feel and workflow of the reservation process. 

You should create a Reserve view on the reservations table. In the configuration, you specify the fields
as explained above. You will also need to configure:

- What services are available. Each service has a name and a duration.
- What the availability is, your opening hours. You specify these in blocks of time and the day of the week.

### Using the "Reservation availabilites" table provider

Using the table provider gives you full control over the workflow and the look and feel of your reservation process. 

First, define a standard database table for reservations as described above. This table should also have an Edit view for adding new reservations.

Now define a new table with the reservation availabilities table provider. in the configuration, pick the table for the reservations and fill out the field choices. You also set up the different services offered and the times you are available.

You can now create lists or feed views on this provided table in order to display your availability to the user. 

In order to let the user perform a reservation you should link to the edit view on the reservations table. Create a viewlink and pick this edit view on the reservations table with no relation. you need to use the extra state formula to identify the reservation time and duration. If you start tiem field name is `startat` and the duration field is `duration`, use this as the extra state formula: `{startat: start_date, duration: service_duration}` - `start_date` and `service_duration` are fields defined by the table provider as you can see in the field list. You can also use other Fields such as the service title to fill information in the edit view.

You may also want to use the validate_reservation action to ensure that reservation is still available at the time of the booking (that is, it was not reserved by another user while the user was looking at the edit view). In the reservations table add a trigger with when=Validate and action=validate_reservation. This is simply configured by selecting the provided table.

### Multiday bookings

The Available Resources Feed view is used to make multi-day bookings for instance for hotel or car rental. 