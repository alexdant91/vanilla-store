class Observer {
    constructor() {
        this.listeners = {};
    }

    /**
     * Add a new listener to the observer
     * @param {string} type
     * @param {function} callback
     * @param {object} options
     * @param {boolean} options.once
     * @param {number} options.priority
     */
    addListener = (type, callback, options = { once: false, priority: 0 }) => {
        const { once, priority } = options;

        if (typeof type !== "string") throw new Error("Type must be a string");
        if (typeof callback !== "function") throw new Error("Callback must be a function");
        if (typeof once !== "boolean") throw new Error("Once must be a boolean");
        if (typeof priority !== "number") throw new Error("Priority must be a number");

        if (!this.listeners[type]) this.listeners[type] = [];

        this.listeners[type].push({ callback, once, priority });
    }

    /**
     * Remove a listener from the observer
     * @param {string} type
     * @param {function} callback
     */
    removeListener = (type, callback) => {
        if (typeof type !== "string") throw new Error("Type must be a string");
        if (typeof callback !== "function") throw new Error("Callback must be a function");

        if (!this.listeners[type]) return;

        this.listeners[type] = this.listeners[type].filter(listener => listener.callback !== callback);
    }

    /**
     * Emit an event to the observer
     * @param {string} type
     * @param {any} payload
     */
    emit = (type, payload) => {
        if (typeof type !== "string") throw new Error("Type must be a string");

        if (!this.listeners[type]) return;

        this.listeners[type].sort((a, b) => a.priority - b.priority).forEach(listener => {
            listener.callback(payload);

            if (listener.once) this.removeListener(type, listener.callback);
        });
    } 
}

class Store extends Observer {
    #state = {};
    #callback;
    #actions = {};
    #queries = {};
    #cache = {};
    #options = {
        useLocalStorage: false,
    };

    /**
     * Create a new store
     * @param {object|function} initialState 
     * @param {function} [callback]
     */
    constructor(initialState = {}, callback) {
        super();

        if (typeof initialState === "function") callback = initialState;
        
        if (initialState && typeof initialState !== "function" && (Array.isArray(initialState) || typeof initialState !== "object")) throw new Error("Initial state must be and object");
        if (callback && typeof callback !== "function") throw new Error("Callback must be a function");
        
        if (this.#options.useLocalStorage) {
            this.#state = { ...Store.localStorageAdapter.get("StoreState") };
        } else {
            this.#state = typeof initialState === "function" ? {} : { ...initialState };
        }
        
        if (typeof callback === "function") this.#callback = callback;

        if (this.#callback) this.addListener("stateChange", () => {
            if (this.#options.useLocalStorage) {
                Store.localStorageAdapter.set("StoreState", this.#state);
            }
            this.#callback(this.#state);
        });
    }

    /**
     * Capitalize a string
     * @param {string} string
     * @returns {string}
     * @private
     * @static
     */
    static capitalizeSting = (string) => {
        if (typeof string !== "string") throw new Error("String must be a string");

        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /**
     * Get an object from an array
     * @param {array} array
     * @returns {object}
     * @private
     * @static
     */
    static getObjectFromArray = (array) => {
        if (!Array.isArray(array)) throw new Error("Array must be an array");

        return array.reduce((acc, item) => {
            acc[item.name] = item;
            return acc;
        }, {});
    }

    /**
     * Local storage adapter
     * @private
     * @static
     * @type {object}
     * @property {function} get
     * @property {function} set
     * @property {function} remove
     */
    static localStorageAdapter = {
        /**
         * Get a value from local storage
         * @param {string} key
         * @returns {any}
         */
        get: (key) => {
            if (typeof key !== "string") throw new Error("Key must be a string");

            return JSON.parse(localStorage.getItem(key));
        },
        /**
         * Set a value in local storage
         * @param {string} key
         * @param {any} value
         * @returns {void}
         */
        set: (key, value) => {
            if (typeof key !== "string") throw new Error("Key must be a string");
            if (value === undefined) throw new Error("Value can't be undefined");

            localStorage.setItem(key, JSON.stringify(value));
        },
        /**
         * Remove a value from local storage
         * @param {string} key
         * @returns {void}
         */
        remove: (key) => {
            if (typeof key !== "string") throw new Error("Key must be a string");

            localStorage.removeItem(key);
        },
    };

    /**
     * Set the options for the store
     * @param {object} options 
     * @param {boolean} options.useLocalStorage
     */
    setOptions = (options = { useLocalStorage: false }) => {
        const { useLocalStorage } = options;

        if (typeof useLocalStorage !== "boolean") throw new Error("UseLocalStorage must be a boolean");

        this.#options = { ...this.#options, useLocalStorage };

        return this;
    }

    /**
     * Create a new piece of state
     * @param {object} options 
     * @param {string} options.name 
     * @param {any} options.initialState 
     */
    use = (...options) => {
        options.forEach(option => {
            const { name, initialState } = option;

            if (typeof name !== "string") throw new Error("Name must be a string");
            if (initialState === undefined) throw new Error("Initial state can't be undefined");

            if (this.#options.useLocalStorage) {
                if (Store.localStorageAdapter.get("StoreState")) {
                    this.#state = { ...this.#state, ...Store.localStorageAdapter.get("StoreState") };
                } else {
                    Store.localStorageAdapter.set("StoreState", this.#state);
                }
            } else {
                this.#state = { ...this.#state, ...initialState };
            }
        });
    }

    /**
     * Get value from state by secting the correct piece of data
     * @param {function} selector 
     */
    select = (selector) => {
        if (typeof selector !== "function") throw new Error("Selector must be a function");

        return selector(this.#state);
    }

    /**
     * Register multiple reducers for a single action
     * @param {object} options 
     * @param {string} options.type 
     * @param {object} options.reducers 
     */
    registerAction = (options = { type, reducers }) => {
        const { type, reducers } = options;
        
        if (typeof type !== "string") throw new Error("Type must be a string");
        if (Array.isArray(reducers) || typeof reducers !== "object") throw new Error("Reducers must be an object");
        
        const actions = Store.getObjectFromArray(Object.keys(reducers).map(key => {
            return {
                name: key,
                callback: (payload) => reducers[key](this.#state, payload),
                [`use${Store.capitalizeSting(key)}`]: (payload) => ({ name: key, payload }),
            }
        }));
        
        if (this.#actions[type]) this.#actions[type] = { ...this.#actions[type].actions, actions };
        else this.#actions[type] = actions;
        
        const mappedActions = {};

        Object.keys(actions).forEach(key => {
            mappedActions[`use${Store.capitalizeSting(key)}`] = actions[key][`use${Store.capitalizeSting(key)}`];
        });

        return mappedActions;
    }

    /**
     * Register a callback to be executed when the state changes 
     * @param {function} callback 
     * @deprecated
     */
    registerCallback = (callback) => {
        if (typeof callback !== "function") throw new Error("Callback must be a function");

        this.#callback = callback;

        this.addListener("stateChange", () => {
            if (this.#options.useLocalStorage) {
                Store.localStorageAdapter.set("StoreState", this.#state);
            }
            this.#callback(this.#state);
        });
    }

    /**
     * Register multiple queries for a single action
     * @param {object} options
     * @param {string} options.type
     * @param {string} options.host
     * @param {object} options.endpoints
     * @returns {object}
     */
    registerQuery = (options = { type, host, endpoints }) => {
        const { type, host, endpoints } = options;

        if (typeof type !== "string") throw new Error("Type must be a string");
        if (typeof host !== "string") throw new Error("Host must be a string");
        if (Array.isArray(endpoints) || typeof endpoints !== "object") throw new Error("Endpoints must be an object");

        const queries = Store.getObjectFromArray(Object.keys(endpoints).map(key => {
            return {
                name: key,
                callback: (payload) => endpoints[key](payload),
                [`use${Store.capitalizeSting(key)}`]: (payload) => ({ type, name: key, payload }),
            }
        }));

        if (this.#queries[type]) this.#queries[type] = { ...this.#queries[type], ...queries };
        else this.#queries[type] = queries;

        const mappedQueries = {};

        Object.keys(queries).forEach(key => {
            mappedQueries[`use${Store.capitalizeSting(key)}`] = (payload, options = { selector: () => null, force: false, pollingInterval: 0 }) => {
                const { pollingInterval, force } = { pollingInterval: 0, force: false, ...options };
                
                const fetchData = async (payload, options = { selector: () => null }) => {
                    const { selector } = { selector: () => null, ...options };
                    const { query, tagType, cacheLogic } = queries[key].callback(payload);

                    if (!this.#cache[type]) this.#cache[type] = {};
                    
                    let inCache = [];
                    let _dataProbably = null;
                    
                    if (this.#cache[type][tagType] && cacheLogic) {
                        Object.keys(cacheLogic).forEach(key => {
                            if (this.#cache[type][tagType][key] == cacheLogic[key]) {
                                _dataProbably = this.#cache[type][tagType][key];
                            }
                            
                            inCache.push(this.#cache[type][tagType][key] !== cacheLogic[key]);
                        });
                    }

                    if (_dataProbably !== null) {
                        this.emit("queryChange", { type, tagType, state: this.#cache[type] });
                        return;
                    }
                    
                    if (force == true || inCache.indexOf(false) === -1) {
                        const API_URL = `${host}${query}`;
                        
                        try {
                            const response = await fetch(API_URL);
                            const data = await response.json();
                            
                            if (response.ok === false) throw new Error(data.message);
                            
                            const partial = selector(data);
                            
                            if (!this.#state[type]) this.#state[type] = {};
                            
                            this.#state[type][tagType] = partial == null ? data : partial;
                            this.#cache[type][tagType] = partial == null ? data : partial;
    
                            this.emit("stateChange", { type, tagType, state: this.#state});
                            this.emit("queryChange", { type, tagType, state: this.#state[type] });

    
                            return { refetch: mappedQueries[`use${Store.capitalizeSting(key)}`] }
                        } catch (error) {
                            throw new Error(error);
                        }
                    } else {
                        this.emit("queryChange", { type, tagType, state: this.#cache[type] });
                    }

                }
                
                if (pollingInterval > 0) {
                    fetchData(payload, options);
                    setInterval(() => {
                        fetchData(payload, options);
                    }, pollingInterval);
                } else {
                    fetchData(payload, options);
                }

                return { refetch: fetchData }
            };
        });

        return mappedQueries;
    }

    /**
     * Listen to a query
     * @param {function} query
     * @param {object} options
     * @param {function} options.onLoading
     * @param {function} options.onFetching
     * @param {function} options.onError
     * @param {function} options.onSuccess
     */
    listen = (query, options = { onLoading: () => {}, onError: () => {}, onSuccess: () => {} }) => {
        const { onLoading, onError, onSuccess } = { onLoading: () => {}, onError: () => {}, onSuccess: () => {}, ...options };

        if (typeof query !== "function") throw new Error("Query must be a function");
        if (typeof onLoading !== "function") throw new Error("OnLoading must be a function");
        if (typeof onError !== "function") throw new Error("OnError must be a function");
        if (typeof onSuccess !== "function") throw new Error("OnSuccess must be a function");

        this.addListener("queryChange", (data) => {
            const { type, state: queryData } = data;

            if (queryData === undefined || queryData === null) return onError();

            if (queryData) {
                return onSuccess(queryData);
            }

            return onSuccess(queryData);
        });

        query();
    }

    /**
     * Dispatch a new action executing 
     * @param {string} type
     * @param {function} action
     */
    dispatch = (type, action = () => {}) => {
        if (typeof type !== "string") throw new Error("Type must be a string");
        if (typeof action !== "object") throw new Error("Action must be a valid action function");

        if (!this.#actions[type]) throw new Error("No actions found for type");

        const { name, payload } = action;
        
        const currentAction = this.#actions[type][name];

        if (!currentAction) throw new Error("No action found");

        const { callback } = currentAction;

        callback(payload);

        this.emit("stateChange", { type, state: this.#state});
    }

    /**
     * 
     */
    mutate = (type, tagType, mutation = () => {}) => {
        if (typeof type !== "string") throw new Error("Type must be a string");
        if (tagType && typeof tagType !== "string") throw new Error("TagType must be a string");
        if (typeof mutation !== "function") throw new Error("Mutation must be a valid function");

        this.#state[type] = mutation(this.#state[type]);

        this.emit("stateChange", { type, tagType, state: this.#state});
    }

    /**
     * Watch for a specific state change
     * @param {string|[string]} type
     * @param {function} callback
     */
    watch = (type, callback) => {
        if (typeof type !== "string" && !Array.isArray(type)) throw new Error("Type must be a string or an array");
        if (typeof callback !== "function") throw new Error("Callback must be a function");

        if (Array.isArray(type)) {
            this.addListener("stateChange", ({ type: __type, tagType, state }) => {
                if (type.indexOf(__type) !== -1) callback({ type: __type, tagType, state });
            });
        } else {
            this.addListener("stateChange", ({ type: __type, tagType, state }) => {
                if(type == __type) callback({ type: __type, tagType, state });
            });
        }
    }
}