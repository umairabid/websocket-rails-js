/*
WebsocketRails JavaScript Client

Setting up the dispatcher:
  var dispatcher = new WebSocketRails('localhost:3000/websocket');
  dispatcher.on_open = function() {
    // trigger a server event immediately after opening connection
    dispatcher.trigger('new_user',{user_name: 'guest'});
  })

Triggering a new event on the server
  dispatcherer.trigger('event_name',object_to_be_serialized_to_json);

Listening for new events from the server
  dispatcher.bind('event_name', function(data) {
    console.log(data.user_name);
  });
 */
var bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

this.WebSocketRails = (function() {
  function WebSocketRails(url, use_websockets) {
    this.url = url;
    this.use_websockets = use_websockets != null ? use_websockets : true;
    this.connection_stale = bind(this.connection_stale, this);
    this.pong = bind(this.pong, this);
    this.supports_websockets = bind(this.supports_websockets, this);
    this.dispatch_channel = bind(this.dispatch_channel, this);
    this.unsubscribe = bind(this.unsubscribe, this);
    this.subscribe_private = bind(this.subscribe_private, this);
    this.subscribe = bind(this.subscribe, this);
    this.dispatch = bind(this.dispatch, this);
    this.trigger_event = bind(this.trigger_event, this);
    this.trigger = bind(this.trigger, this);
    this.bind = bind(this.bind, this);
    this.connection_established = bind(this.connection_established, this);
    this.new_message = bind(this.new_message, this);
    this.reconnect = bind(this.reconnect, this);
    this.callbacks = {};
    this.channels = {};
    this.queue = {};
    this.connect();
  }

  WebSocketRails.prototype.connect = function() {
    this.state = 'connecting';
    if (!(this.supports_websockets() && this.use_websockets)) {
      this._conn = new WebSocketRails.HttpConnection(this.url, this);
    } else {
      this._conn = new WebSocketRails.WebSocketConnection(this.url, this);
    }
    return this._conn.new_message = this.new_message;
  };

  WebSocketRails.prototype.disconnect = function() {
    if (this._conn) {
      this._conn.close();
      delete this._conn._conn;
      delete this._conn;
    }
    return this.state = 'disconnected';
  };

  WebSocketRails.prototype.reconnect = function() {
    var event, id, old_connection_id, ref, ref1;
    old_connection_id = (ref = this._conn) != null ? ref.connection_id : void 0;
    this.disconnect();
    this.connect();
    ref1 = this.queue;
    for (id in ref1) {
      event = ref1[id];
      if (event.connection_id === old_connection_id && !event.is_result()) {
        this.trigger_event(event);
      }
    }
    return this.reconnect_channels();
  };

  WebSocketRails.prototype.new_message = function(data) {
    var event, i, len, ref, results, socket_message;
    results = [];
    for (i = 0, len = data.length; i < len; i++) {
      socket_message = data[i];
      event = new WebSocketRails.Event(socket_message);
      if (event.is_result()) {
        if ((ref = this.queue[event.id]) != null) {
          ref.run_callbacks(event.success, event.data);
        }
        delete this.queue[event.id];
      } else if (event.is_channel()) {
        this.dispatch_channel(event);
      } else if (event.is_ping()) {
        this.pong();
      } else {
        this.dispatch(event);
      }
      if (this.state === 'connecting' && event.name === 'client_connected') {
        results.push(this.connection_established(event.data));
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  WebSocketRails.prototype.connection_established = function(data) {
    this.state = 'connected';
    this._conn.setConnectionId(data.connection_id);
    this._conn.flush_queue();
    if (this.on_open != null) {
      return this.on_open(data);
    }
  };

  WebSocketRails.prototype.bind = function(event_name, callback) {
    var base;
    if ((base = this.callbacks)[event_name] == null) {
      base[event_name] = [];
    }
    return this.callbacks[event_name].push(callback);
  };

  WebSocketRails.prototype.trigger = function(event_name, data, success_callback, failure_callback) {
    var event, ref;
    event = new WebSocketRails.Event([event_name, data, (ref = this._conn) != null ? ref.connection_id : void 0], success_callback, failure_callback);
    return this.trigger_event(event);
  };

  WebSocketRails.prototype.trigger_event = function(event) {
    var base, name1;
    if ((base = this.queue)[name1 = event.id] == null) {
      base[name1] = event;
    }
    if (this._conn) {
      this._conn.trigger(event);
    }
    return event;
  };

  WebSocketRails.prototype.dispatch = function(event) {
    var callback, i, len, ref, results;
    if (this.callbacks[event.name] == null) {
      return;
    }
    ref = this.callbacks[event.name];
    results = [];
    for (i = 0, len = ref.length; i < len; i++) {
      callback = ref[i];
      results.push(callback(event.data));
    }
    return results;
  };

  WebSocketRails.prototype.subscribe = function(channel_name, success_callback, failure_callback) {
    var channel;
    if (this.channels[channel_name] == null) {
      channel = new WebSocketRails.Channel(channel_name, this, false, success_callback, failure_callback);
      this.channels[channel_name] = channel;
      return channel;
    } else {
      return this.channels[channel_name];
    }
  };

  WebSocketRails.prototype.subscribe_private = function(channel_name, success_callback, failure_callback) {
    var channel;
    if (this.channels[channel_name] == null) {
      channel = new WebSocketRails.Channel(channel_name, this, true, success_callback, failure_callback);
      this.channels[channel_name] = channel;
      return channel;
    } else {
      return this.channels[channel_name];
    }
  };

  WebSocketRails.prototype.unsubscribe = function(channel_name) {
    if (this.channels[channel_name] == null) {
      return;
    }
    this.channels[channel_name].destroy();
    return delete this.channels[channel_name];
  };

  WebSocketRails.prototype.dispatch_channel = function(event) {
    if (this.channels[event.channel] == null) {
      return;
    }
    return this.channels[event.channel].dispatch(event.name, event.data);
  };

  WebSocketRails.prototype.supports_websockets = function() {
    return typeof WebSocket === "function" || typeof WebSocket === "object";
  };

  WebSocketRails.prototype.pong = function() {
    var pong, ref;
    pong = new WebSocketRails.Event(['websocket_rails.pong', {}, (ref = this._conn) != null ? ref.connection_id : void 0]);
    return this._conn.trigger(pong);
  };

  WebSocketRails.prototype.connection_stale = function() {
    return this.state !== 'connected';
  };

  WebSocketRails.prototype.reconnect_channels = function() {
    var callbacks, channel, name, ref, results;
    ref = this.channels;
    results = [];
    for (name in ref) {
      channel = ref[name];
      callbacks = channel._callbacks;
      channel.destroy();
      delete this.channels[name];
      channel = channel.is_private ? this.subscribe_private(name) : this.subscribe(name);
      channel._callbacks = callbacks;
      results.push(channel);
    }
    return results;
  };

  return WebSocketRails;

})();

// ---
// generated by coffee-script 1.9.2
