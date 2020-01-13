import {HBDevoloDevice} from '../HBDevoloDevice';
import { Devolo } from 'node-devolo/dist/Devolo';
import { Device } from 'node-devolo/dist/DevoloDevice';

export class HBDevoloShutterDevice extends HBDevoloDevice {

    windowCoveringService;

    apiGetValue;
    apiGetTargetValue;

    shutterLastCurrentValue;
    shutterLastTargetValue;
    shutterLastPositionState;

    sensorTypeName;

    _delayedInterval;

    constructor(log, dAPI: Devolo, dDevice: Device, storage, config) {
        super(log, dAPI, dDevice, storage, config);

        var self = this;
        self.dDevice.events.on('onValueChanged', function(type: string, value: number) {
            //self.windowCoveringService.getCharacteristic(self.Characteristic.CurrentPosition).updateValue(value, null);
            self.log.info('%s (%s / %s) > onValueChanged > Current position was %s, now set to %s (sensor type: %s)', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, self.shutterLastCurrentValue, value, type);
            self.shutterLastCurrentValue = value;
            if (value == this.shutterLastTargetValue) {
                self.windowCoveringService.getCharacteristic(self.Characteristic.PositionState).updateValue(self.Characteristic.PositionState.STOPPED, null);
            }
        });
        self.dDevice.events.on('onTargetValueChanged', function(type: string, value: number) {
            self.windowCoveringService.getCharacteristic(self.Characteristic.TargetPosition).updateValue(value, null);
            self.log.info('%s (%s / %s) > onTargetValueChanged > Target position was %s, set to %s (sensor type: %s)', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, self.shutterLastTargetValue, value, type);
            if (value > self.shutterLastTargetValue) {
                // Öffnen
                self.windowCoveringService.getCharacteristic(self.Characteristic.PositionState).updateValue(self.Characteristic.PositionState.INCREASING, null);
                self.log.info('%s (%s / %s) > onTargetValueChanged > Target position was %s, now %s, set position state to increasing', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, self.shutterLastTargetValue, value);
                self.shutterLastPositionState = self.Characteristic.PositionState.INCREASING
            } else {
                // Schließen
                self.windowCoveringService.getCharacteristic(self.Characteristic.PositionState).updateValue(self.Characteristic.PositionState.DECREASING, null);
                self.log.info('%s (%s / %s) > onTargetValueChanged > Target position was %s, now %s, set position state to decreasing', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, self.shutterLastTargetValue, value);
                self.shutterLastPositionState = self.Characteristic.PositionState.DECREASING
            }
            self.shutterLastTargetValue = value;
        });
        self.dDevice.events.on('onCurrentValueChanged', function(type: string, value: number) {
            self.log.info('%s (%s / %s) > onCurrentValueChanged > CurrentConsumption is %s (sensor type: %s)', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, value, type);
            if(type==='energy') {
                self.windowCoveringService.getCharacteristic(self.Characteristic.DevoloCurrentConsumption).updateValue(value, null);
                if(value === 0) {
                    self.windowCoveringService.getCharacteristic(self.Characteristic.CurrentPosition).updateValue(self.shutterLastCurrentValue, null);
                    self.windowCoveringService.getCharacteristic(self.Characteristic.PositionState).updateValue(self.Characteristic.PositionState.STOPPED, null);
                    self.log.info('%s (%s / %s) > onCurrentValueChanged > CurrentConsumption is %s, set current position to %s and position state to stopped', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, value, self.shutterLastCurrentValue);
                    self.shutterLastPositionState = self.Characteristic.PositionState.STOPPED
                }
            }
        });
        self.dDevice.events.on('onTotalValueChanged', function(type: string, value: number) {
            if(type==='energy') {
                self.windowCoveringService.getCharacteristic(self.Characteristic.DevoloTotalConsumption).updateValue(value, null);
                self.log.info('%s (%s / %s) > onTotalValueChanged > DevoloTotalConsumption is %s', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, value);
            }
        });
        self.dDevice.events.on('onSinceTimeChanged', function(type: string, value: number) {
            if(type==='energy') {
                self.windowCoveringService.getCharacteristic(self.Characteristic.DevoloTotalConsumptionSince).updateValue(new Date(value).toISOString().replace(/T/, ' ').replace(/\..+/, ''), null);
                self.log.info('%s (%s / %s) > onSinceTimeChanged > DevoloTotalConsumptionSince is %s', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, value);
            }
        });
    }

    getServices() {
        this.log.info('shutter device manufacturer: %s ', this.dDevice.manID);

        this.informationService = new this.Service.AccessoryInformation();
        if (this.dDevice.manID == '0x010f') {
            this.informationService.setCharacteristic(this.Characteristic.Manufacturer, 'Fibaro');
            this.sensorTypeName = 'base';
        } else {
            this.informationService.setCharacteristic(this.Characteristic.Manufacturer, 'Devolo');
            this.sensorTypeName = 'blinds';
        }
        this.informationService
            .setCharacteristic(this.Characteristic.Model, 'Shutter')
            .setCharacteristic(this.Characteristic.SerialNumber, this.dDevice.id.replace('/','-'))

        this.windowCoveringService = new this.Service.WindowCovering();
        this.windowCoveringService.getCharacteristic(this.Characteristic.CurrentPosition)
                     .on('get', this.getValue.bind(this));
        this.windowCoveringService.getCharacteristic(this.Characteristic.PositionState)
        this.windowCoveringService.getCharacteristic(this.Characteristic.TargetPosition)
                     .on('get', this.getTargetValue.bind(this))
                     .on('set', this.setTargetValue.bind(this));

        if (this.dDevice.manID == '0x010f') { //Fibaro
            this.windowCoveringService.getCharacteristic(this.Characteristic.TargetPosition).setProps({
                minValue: 0,
                maxValue: 99,
                minStep: 1
            });
        } else {
            this.windowCoveringService.getCharacteristic(this.Characteristic.TargetPosition).setProps({
                minValue: 0,
                maxValue: 100,
                minStep: 5
            });
        }

        this.shutterLastCurrentValue = this.dDevice.getValue(this.sensorTypeName);
        this.shutterLastTargetValue = this.dDevice.getTargetValue(this.sensorTypeName);
        this.shutterLastPositionState = this.Characteristic.PositionState.STOPPED

        this.dDevice.listen();
        return [this.informationService, this.windowCoveringService];
    }

    getValue(callback) {
        this.apiGetValue = this.dDevice.getValue(this.sensorTypeName)
        this.log.debug('%s (%s / %s) > getValue is %s', (this.constructor as any).name, this.dDevice.id, this.dDevice.name, this.apiGetValue);
        return callback(null, this.apiGetValue);
    }

    getTargetValue(callback) {
        this.apiGetTargetValue = this.dDevice.getTargetValue(this.sensorTypeName)
        this.log.debug('%s (%s / %s) > getTargetValue is %s', (this.constructor as any).name, this.dDevice.id, this.dDevice.name, this.apiGetTargetValue);
        return callback(null, this.apiGetTargetValue);
    }

    setTargetValue(value, callback) {
        //this.log.debug('%s (%s / %s) > setTargetValue to %s', (this.constructor as any).name, this.dDevice.id, this.dDevice.name, value);
        if(value==this.dDevice.getTargetValue(this.sensorTypeName)) {
            callback();
            return;
        }
        if(value==0 || value==100) {
            this.log.debug('%s (%s / %s) > setTargetValue to %s', (this.constructor as any).name, this.dDevice.id, this.dDevice.name, value);
            this.dDevice.setTargetValue(this.sensorTypeName, value, function(err) {}, true);
        } else {
            this.log.debug('%s (%s / %s) > setTargetValue delayed to %s', (this.constructor as any).name, this.dDevice.id, this.dDevice.name, value);
            this._setTargetValueDelayed(1500, value);
        }
        callback();
    }

    _setTargetValueDelayed(delay, value) {
        var self = this;
        if(self._delayedInterval) {
            clearTimeout(self._delayedInterval);
        }
        self._delayedInterval = setTimeout(function() {
            self.log.debug('%s (%s / %s) > setTargetValue now to %s', (self.constructor as any).name, self.dDevice.id, self.dDevice.name, value);
            self.dDevice.setTargetValue(this.sensorTypeName, value, function(err) {}, true);
        }, delay);
    }
}