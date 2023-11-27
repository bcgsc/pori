npm install sequelize-cli>5.2
npm install pg pg-hstore
[ -f config/config.json ] || ./node_modules/.bin/sequelize-cli init
./node_modules/.bin/sequelize-cli db:migrate
npm start