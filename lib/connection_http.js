module.exports = Connection;

var util = require('util');
var Socket = require('net').Socket;
var HTTP = require('http');
var URL = require('url');
var MAGIC = 'VT01';

require('util').inherits(Connection, require('events').EventEmitter);

function Connection(options) {
    this.connectOptions = options;
    this.on('readable', this._readPacket.bind(this));
}

Connection.prototype.connect = function(port, host) {
    var self = this;

    var url = URL.parse(this.connectOptions.proxy_http);
    url.path = host + ':' + port;
    url.method = 'CONNECT';

    if (url.auth) {
        url.headers = {"Proxy-Authorization": "Basic " + (new Buffer(url.auth, 'utf8')).toString('base64')};
        delete url.auth;
    }
    var req = HTTP.request(url);
    req.end();
    req.setTimeout(this.connectOptions.connectTimeOut || 5000);

    var connectionEstablished = false;
    req.on('connect', function (res, socket) {
        if (connectionEstablished) {
            socket.end();
            return;
        }

        connectionEstablished = true;
        req.setTimeout(0);

        if (res.statusCode != 200) {
            callback(new Error("HTTP CONNECT " + res.statusCode + " " + res.statusMessage));
            return;
        }

        self._stream = socket;
        self._setupStream();
        self.emit('connect');
    });

    req.on('timeout', function () {
        self.emit('error', "Proxy connection timed out");
        self.emit('close');
        connectionEstablished = true;
    });

    req.on('error', function () {
        self.emit.apply(self, ['error'].concat(Array.prototype.slice.call(arguments)));
        //self.emit('close');
        connectionEstablished = true;
    });
}
Connection.prototype._setupStream = function() {
    var self = this;
    this._stream.on('readable', this._readPacket.bind(this));
    this._stream.on('close', function() { self.emit.apply(self, ['close'].concat(Array.prototype.slice.call(arguments))); });
    this._stream.on('error', function() { self.emit.apply(self, ['error'].concat(Array.prototype.slice.call(arguments))); });
    this._stream.on('connect', function() { self.emit.apply(self, ['connect'].concat(Array.prototype.slice.call(arguments))); });
    this._stream.on('end', function() { self.emit.apply(self, ['end'].concat(Array.prototype.slice.call(arguments))); });
    this._stream.on('timeout', function() { self.emit.apply(self, ['timeout'].concat(Array.prototype.slice.call(arguments))); });
    this.setTimeout = this._stream.setTimeout;
};
Connection.prototype.setTimeout = function() {

}

Connection.prototype.send = function (data) {
    // encrypt
    if (this.sessionKey) {
        data = require('steam-crypto').symmetricEncrypt(data, this.sessionKey);
    }

    var buffer = new Buffer(4 + 4 + data.length);
    buffer.writeUInt32LE(data.length, 0);
    buffer.write(MAGIC, 4);
    data.copy(buffer, 8);
    this._stream.write(buffer);
};
Connection.prototype._readPacket = function () {
    if (!this._packetLen) {
        var header = this._stream.read(8);
        if (!header) {
            return;
        }
        this._packetLen = header.readUInt32LE(0);
    }

    var packet = this._stream.read(this._packetLen);

    if (!packet) {
        this.emit('debug', 'incomplete packet');
        return;
    }

    delete this._packetLen;

    // decrypt
    if (this.sessionKey) {
        packet = require('steam-crypto').symmetricDecrypt(packet, this.sessionKey);
    }

    this.emit('packet', packet);

    // keep reading until there's nothing left
    this._readPacket();
};
