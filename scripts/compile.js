const fs = require('fs');

const prefix = `(function () {
`;
const suffix = `
	window.dom = dom;
	window.on = on;
	window.mouse = mouse;
}());`;

function compile () {
	const onFile = fs.readFileSync('./node_modules/@clubajax/on/src/on.js').toString().split('return on;')[0].split('\'use strict\';')[1];
	const domFile = fs.readFileSync('./node_modules/@clubajax/dom/src/dom.js').toString().split('return dom;')[0].split('\'use strict\';')[1];
	const mouseFile = fs.readFileSync('./src/mouse.js').toString().split('return mouse;')[0].split('\'use strict\';')[1];
	const file = `${prefix}${onFile}${domFile}${mouseFile}${suffix}`;
	fs.writeFileSync('./dist/mouse.js', file);
}

module.exports = compile;
