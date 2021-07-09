# reservable - Reservation system for Saltcorn

To use this Plugin, you should create a table for reservations. This table should have the following fields:

* A Date field for the time of the start of the reservation
* An integer field for the duration After reservation in minutes
* Any other fields for the reservation, for instance the email of the person reserving the slot

This table also needs to have two views

* A view to create, typically an Edit view obtain the information required for the booking. 
  This Edit view does not need to have fields for the date or the duration.
* A confirmation view, typically a Show view, which is displayed to the user on a successful reservation. 
  This may or may not contain Date and duration

There may be another table indicating reservable resources. This is optional. If you are building a reservation system
for a single resource, you can leave this out. On the other hand, if you are building a system where multiple resources 
need to be tracked for whether they are available, use this to denote the resources that can be taken/available. 
To do this, create a foreign key field on your reservations Table to the reservable resource table.

You should then create a Reserve view on the reservations table. In the configuration, you specify the fields
As explained above. You will also need to configure:

* What services are available. Each service has a name and a duration.
* What the availability is, your opening hours. You specify these in blocks of time and the day of the week.

### Example

Goldilocks and Rapunzel together run the successful GoldiRap Hair Salon. In fact they are so successful that 
they must now implement an online booking system. Their opening hours are Monday to Friday 9-12 and 13-17 
(they close for lunch) and Saturday 10-13. They offer two services: A haircut taking 30 minutes 
and a full restyle taking 45 minutes. You can book either Goldilocks or Rapunzel for each of the services.

Here, the reservable resource is the hairdresser with two rows: Goldilocks and Rapunzel. They have two services, 
haircut and full restyle. The availability can be specified as: Mon-Fri 9-12, Mon-Fri 13-17 and Saturday 10-13.


