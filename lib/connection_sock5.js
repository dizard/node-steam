module.exports = Connection;

var util = require('util');
var MAGIC = 'VT01';
var Socket = require('socks5-client').Socket;
util.inherits(Connection, Socket);

function Connection(config) {
    Socket.call(this, config);
    this.on('data', function (data) {
        if (!this._packetLen) {
            this._packetLen = data.readInt32LE(0);
            if (!this._packetLen) {
                return;
            }
        }
        var packet = data.slice(8, this._packetLen + 8);
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
    })

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
    this.write(buffer);
};

Connection.prototype._readPacket = function () {
    if (!this._packetLen) {
        var header = this.read(8);
        if (!header) {
            return;
        }
        this._packetLen = header.readUInt32LE(0);
    }

    var packet = this.read(this._packetLen);

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


