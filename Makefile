SUMO_HOME=/Applications/sumo-1.24.0/
convert:
	netconvert --osm-files testmap2/map.osm \
           -o testmap2/map222.net.xml \
           --keep-edges.by-vclass passenger \
           --geometry.remove \
           --ramps.guess \
           --junctions.join \
           --tls.guess-signals \
           --tls.discard-simple \
           --tls.join \
           --tls.guess.joining \
           --default.junctions.radius 4.5

route:
	python ${SUMO_HOME}/tools/randomTrips.py -n testmap2/map.net.xml -r testmap2/map.rou.xml -e 10000 -p 1.5