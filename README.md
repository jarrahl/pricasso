# pricasso
A Node/jQuery SPA to crowd-source a direction vector based on combining user inputs.

This project was developed in order to assist a friend 'Pri' conduct a social/art/tech experiment during the 2020 Covid lockdown.
He bought a large canvas, and would use the direction of the arrow on the Pricasso website to determine the direction of his paintbrush in real time.
The site also provides a colour wheel which users can rotate. Pri would mix paint colours on the fly in an attempt to replicate the colour currently being
indicated.

The result is a piece that looks like a ridiculously complex city subway map, as the relatively small number of concurrent users and the limitation of each user
only being able to enter a cardinal (up/down/left/right) direction meant that most of the time the combined direction was a multiple of 45 degrees.

Each user can re-enter their chosen direction up to 6 times a second, and the strength of their vote quickly decays.
