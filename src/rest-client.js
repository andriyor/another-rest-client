
function encodeUrl(data) {
    let res = '';
    for (let k in data)
        res += encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) + '&';
    return res.substr(0, res.length - 1);
}

class RestClient {
    constructor(axios, options) {
        this.axios = axios;
        this.conf(options);

        // resource must be super class of RestClient
        // but fucking js cannot into callable objects, so...
        // After this call all resource methods will be defined
        // on current RestClient instance (this behaviour affected by last parameter)
        // At least this parameters are symmetric :D
        resource(this, undefined, '', undefined, this);
    }

    conf(options={}) {
        let currentOptions = this._opts || {
            shortcut: true,
            shortcutRules: [],
        };

        this._opts = Object.assign(currentOptions, options);

        return Object.assign({}, this._opts);
    }
}

function resource(client, parent, name, id, ctx) {
    let self = ctx ? ctx : (newId) => {
        if (newId === undefined)
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
                client._opts.shortcutRules.forEach(rule => {
                    let customShortcut = rule(resName);
                    if (customShortcut && typeof customShortcut === 'string') {
                        self._shortcuts[customShortcut] = r;
                        self[customShortcut] = r;
                    }
                });
            }
            return r;
        };

        // (resources instanceof String) don't work. Fuck you, javascript.
        if (resources.constructor === String)
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
        if (id !== undefined)
            url += '/' + id;
        return url;
    };

    self.get = (...args) => {
        let url = self.url();
        const query = args.map(encodeUrl).join('&')
        if (query)
            url += '?' + query;
        return client.axios.get(url);
    };

    self.post = (data) => {
        return client.axios.post(self.url(), data);
    };

    self.put = (data) => {
        return client.axios.put(self.url(), data);
    };

    self.patch = (data) => {
        return client.axios.put(self.url(), data);
    };

    self.delete = () => {
        return client.axios.delete(self.url());
    };
    return self;
}

module.exports = RestClient;
