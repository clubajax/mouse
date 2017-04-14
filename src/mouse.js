(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['on'], factory);
	}
	else if (typeof module === 'object' && module.exports) {
		// Node / CommonJS
		module.exports = factory(require('on'));
	}
	else {
		// Browser globals (root is window)
		root['mouse'] = factory(root.on);
	}
}(this, function (on) {
	'use strict';

	function mouse (node, options) {
		options = options || {};
		var box,
			cBox,
			org,
			last,
			lastx,
			lasty,
			downNode = options.downNode || node;

		var moveHandle = on(window, 'mousemove', function (e) {
			e.preventDefault();
			// TODO: handle scroll
			var
				x = e.clientX - box.x,
				y = e.clientY - box.y;

			if(x > 0 && x < box.w) {
				last.x = x - lastx;
				lastx = x;
			}
			if(y > 0 && y < box.h) {
				last.y = y - lasty;
			}


			lasty = y;

			emit('down', x, y);
			return false;
		});
		var downHandle = on(downNode, 'mousedown', function (e) {

			e.preventDefault();
			box = getBox(node);
			cBox = getBox(downNode);

			var
				x = e.clientX - box.x,
				y = e.clientY - box.y;

			lastx = x;
			lasty = y;

			org = {
				x: x,
				y: y
			};
			last = {
				x: 0,
				y: 0
			};
			moveHandle.resume();
			emit('down', x, y);
			return false;
		});
		var upHandle = on(window, 'mouseup', function (e) {
			moveHandle.pause();
		});
		moveHandle.pause();

		return on.makeMultiHandle([moveHandle, downHandle, upHandle]);

		function emit (type, x, y) {
			on.emit(node, 'mouse', {
				x: x,
				y: y,
				px: range(x/box.w, 0, 1),
				py: range(y/box.h, 0, 1),
				org: org,
				last: last,
				dist:{
					x: x - org.x,
					y: y - org.y
				},
				up: type === 'up',
				down: type === 'down',
				move: type === 'move',
				mouseType: type
			});
		}

	}

	return mouse;

}));

function range (value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function getBox (node){
	if(node === window){
		node = document.documentElement;
	}
	// node dimensions
	// returned object is immutable
	// add scroll positioning and convenience abbreviations
	var
		dimensions = node.getBoundingClientRect();
	return {
		top: dimensions.top,
		right: dimensions.right,
		bottom: dimensions.bottom,
		left: dimensions.left,
		height: dimensions.height,
		h: dimensions.height,
		width: dimensions.width,
		w: dimensions.width,
		scrollY: window.scrollY,
		scrollX: window.scrollX,
		x: dimensions.left + window.pageXOffset,
		y: dimensions.top + window.pageYOffset
	};
}