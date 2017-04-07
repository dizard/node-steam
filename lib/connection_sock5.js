module.exports = Connection;

var util = require('util');
var MAGIC = 'VT01';
var Socket = require('socks5-client').Socket;
util.inherits(Connection, Socket);

function Connection(config) {
    this.outstandingData = null;

    Socket.call(this, config);
    this.on('data', function (data) {
        if (this.outstandingData != null) {
            data = Buffer.concat([this.outstandingData, data], this.outstandingData.length + data.length);
            this.outstandingData = null;
        }
        if (data.length) {
            let len = data.readInt32LE(0);
            if (!len) return;
            console.log('data Length',len);
            if (len >= 1 && data.length >= len + 8) {
                console.log('final',data.length-8);
                data = data.slice(8, len + 8);
                if (!data) {
                    this.emit('debug', 'incomplete packet');
                    return;
                }
                if (this.sessionKey) {
                    data = require('steam-crypto').symmetricDecrypt(data, this.sessionKey);
                }
                this.emit('packet', data);
            }
        } else {
            this.outstandingData = data;
        }
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
