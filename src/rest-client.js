import Events from 'minivents'

function encodeUrl(data) {
    let res = '';
    for (let k in data)
        res += encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) + '&';
    return res.substr(0, res.length - 1);
}

function safe(func, data) {
    try {
        return func(data);
    }
    catch(e) {
        console.error('Error in function "' + func.name + '" while decode/encode data');
        console.log(func);
        console.log(data);
        console.log(e);
        return data;
    }
}

class RestClient {
    constructor(host, options) {
        this.host = host;
        this.conf(options);

        new Events(this);

        // resource must be super class of RestClient
        // but fucking js cannot into callable objects, so...
        // After this call all resource methods will be defined
        // on current RestClient instance (this behaviour affected by last parameter)
        // At least this parameters are symmetric :D
        resource(this, undefined, '', undefined, this);
    }

    conf(options={}) {
        let currentOptions = this._opts || {
            trailing: '',
            shortcut: true,
            contentType: 'application/json',
            'application/x-www-form-urlencoded': {encode: encodeUrl},
            'application/json': {encode: JSON.stringify, decode: JSON.parse}
        };

        this._opts = Object.assign(currentOptions, options);

        return Object.assign({}, this._opts);
    }

    _request(method, url, data=null, contentType=null) {
        if (url.indexOf('?') == -1)
            url += this._opts.trailing;
        else
            url = url.replace('?', this._opts.trailing + '?');

        let xhr = new XMLHttpRequest();
        xhr.open(method, this.host + url, true);

        if (contentType) {
            let mime = this._opts[contentType];
            if (mime && mime.encode)
                data = safe(mime.encode, data);
            xhr.setRequestHeader('Content-Type', contentType);
        }

        this.emit('request', xhr);

        let p = new Promise((resolve, reject) => {
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) {
                    this.emit('response', xhr);
                    if (xhr.status == 200 || xhr.status == 201 || xhr.status == 204) {
                        this.emit('success', xhr);

                        let res = xhr.responseText;
                        let responseHeader = xhr.getResponseHeader('Content-Type');
                        if (responseHeader) {
                            let responseContentType = responseHeader.split(';')[0];
                            let mime = this._opts[responseContentType];
                            if (mime && mime.decode)
                                res = safe(mime.decode, res);
                        }
                        resolve(res);
                    } else {
                        this.emit('error', xhr);
                        reject(xhr);
                    }
                }
            };
        });
        xhr.send(data);
        return p;
    }
}

function resource(client, parent, name, id, ctx) {
    let self = ctx ? ctx : (newId) => {
        if (newId == undefined)
            return self;
        return self._clone(parent, newId);
    };

    self._resources = {};
    self._shortcuts = {};

    self._clone = (parent, newId) => {
        let copy = resource(client, parent, name, newId);
        copy._shortcuts = self._shortcuts;
        for (let resName in self._resources) {
            copy._resources[resName] = self._resources[resName]._clone(copy);

            if (resName in copy._shortcuts)
                copy[resName] = copy._resources[resName];
        }
        return copy;
    };

    self.res = (resources, shortcut=client._opts.shortcut) => {
        let makeRes = (resName) => {
            if (resName in self._resources)
                return self._resources[resName];

            let r = resource(client, self, resName);
            self._resources[resName] = r;
            if (shortcut) {
                self._shortcuts[resName] = r;
                self[resName] = r;
            }
            return r;
        };

        // (resources instanceof String) don't work. Fuck you, javascript.
        if (resources.constructor == String)
            return makeRes(resources);

        if (resources instanceof Array)
            return resources.map(makeRes);

        if (resources instanceof Object) {
            let res = {};
            for (let resName in resources) {
                let r = makeRes(resName);
                if (resources[resName])
                    r.res(resources[resName]);
                res[resName] = r;
            }
            return res;
        }
    };

    self.url = () => {
        let url = parent ? parent.url() : '';
        if (name)
            url += '/' + name;
        if (id != undefined)
            url += '/' + id;
        return url;
    };

    self.get = (args) => {
        let url = self.url();
        if (args)
            url += '?' + encodeUrl(args);
        return client._request('GET', url);
    };

    self.post = (data, contentType = client._opts.contentType) => {
        return client._request('POST', self.url(), data, contentType);
    };

    self.put = (data, contentType = client._opts.contentType) => {
        return client._request('PUT', self.url(), data, contentType);
    };

    self.patch = (data, contentType = client._opts.contentType) => {
        return client._request('PATCH', self.url(), data, contentType);
    };

    self.delete = () => {
        return client._request('DELETE', self.url());
    };
    return self;
}

module.exports = RestClient;
