/* eslint-disable max-classes-per-file */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
$(document).ready(() => {
  // if deployed to a site supporting SSL, use wss://
  const protocol = document.location.protocol.startsWith('https') ? 'wss://' : 'ws://';
  const webSocket = new WebSocket(protocol + location.host);

  // A class for holding the last N points of telemetry for a device
  class DeviceData {
    constructor(deviceId) {
      this.deviceId = deviceId;
      this.maxLen = 50;
      this.timeData = new Array(this.maxLen);
      this.temperatureData = new Array(this.maxLen);
      this.powerLevelData = new Array(this.maxLen);
      this.lightColor = 'unknown';
      this.intensity = 0;
      this.temperature = 0;
      this.powerLevel = 0;
    }

    addData(time, temperature, powerLevel, lightColor, intensity) {
      this.timeData.push(time);
      this.temperatureData.push(temperature);
      this.powerLevelData.push(powerLevel);
      
      // Update current state
      this.lightColor = lightColor || this.lightColor;
      this.intensity = intensity || this.intensity;
      this.temperature = temperature || this.temperature;
      this.powerLevel = powerLevel || this.powerLevel;

      if (this.timeData.length > this.maxLen) {
        this.timeData.shift();
        this.temperatureData.shift();
        this.powerLevelData.shift();
      }
    }
  }

  // All the devices in the list (those that have been sending telemetry)
  class TrackedDevices {
    constructor() {
      this.devices = [];
    }

    // Find a device based on its Id
    findDevice(deviceId) {
      for (let i = 0; i < this.devices.length; ++i) {
        if (this.devices[i].deviceId === deviceId) {
          return this.devices[i];
        }
      }

      return undefined;
    }

    getDevicesCount() {
      return this.devices.length;
    }
  }

  const trackedDevices = new TrackedDevices();

  // Define the chart axes
  const chartData = {
    datasets: [
      {
        fill: false,
        label: 'Temperature',
        yAxisID: 'Temperature',
        borderColor: 'rgba(255, 99, 132, 1)',
        pointBoarderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        pointHoverBackgroundColor: 'rgba(255, 99, 132, 1)',
        pointHoverBorderColor: 'rgba(255, 99, 132, 1)',
        spanGaps: true,
      },
      {
        fill: false,
        label: 'Power Level',
        yAxisID: 'PowerLevel',
        borderColor: 'rgba(54, 162, 235, 1)',
        pointBoarderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        pointHoverBackgroundColor: 'rgba(54, 162, 235, 1)',
        pointHoverBorderColor: 'rgba(54, 162, 235, 1)',
        spanGaps: true,
      }
    ]
  };

  const chartOptions = {
    scales: {
      yAxes: [{
        id: 'Temperature',
        type: 'linear',
        scaleLabel: {
          labelString: 'Temperature (ºC)',
          display: true,
        },
        position: 'left',
      },
      {
        id: 'PowerLevel',
        type: 'linear',
        scaleLabel: {
          labelString: 'Power Level (%)',
          display: true,
        },
        position: 'right',
        ticks: {
          min: 0,
          max: 100
        }
      }]
    }
  };

  // Get the context of the canvas element we want to select
  const ctx = document.getElementById('iotChart').getContext('2d');
  const myLineChart = new Chart(
    ctx,
    {
      type: 'line',
      data: chartData,
      options: chartOptions,
    });

  // Function to update traffic light visualization
  function updateTrafficLight(color) {
    // Reset all lights
    document.getElementById('red-light').classList.remove('active');
    document.getElementById('yellow-light').classList.remove('active');
    document.getElementById('green-light').classList.remove('active');
    
    // Activate the current light
    if (color === 'red') {
      document.getElementById('red-light').classList.add('active');
    } else if (color === 'yellow') {
      document.getElementById('yellow-light').classList.add('active');
    } else if (color === 'green') {
      document.getElementById('green-light').classList.add('active');
    }
    
    // Update the text display
    document.getElementById('lightColor').textContent = color.charAt(0).toUpperCase() + color.slice(1);
  }

  // Function to update metrics display
  function updateMetrics(intensity, temperature, powerLevel) {
    document.getElementById('intensity').textContent = intensity.toFixed(1);
    document.getElementById('temperature').textContent = temperature.toFixed(1);
    document.getElementById('powerLevel').textContent = powerLevel.toFixed(1);
  }

  // Manage a list of devices in the UI, and update which device data the chart is showing
  // based on selection
  let needsAutoSelect = true;
  const deviceCount = document.getElementById('deviceCount');
  const listOfDevices = document.getElementById('listOfDevices');
  function OnSelectionChange() {
    const device = trackedDevices.findDevice(listOfDevices[listOfDevices.selectedIndex].text);
    chartData.labels = device.timeData;
    chartData.datasets[0].data = device.temperatureData;
    chartData.datasets[1].data = device.powerLevelData;
    
    // Update the traffic light visualization and metrics
    updateTrafficLight(device.lightColor);
    updateMetrics(device.intensity, device.temperature, device.powerLevel);
    
    myLineChart.update();
  }
  listOfDevices.addEventListener('change', OnSelectionChange, false);

  // When a web socket message arrives:
  // 1. Unpack it
  // 2. Validate it has proper fields
  // 3. Find or create a cached device to hold the telemetry data
  // 4. Append the telemetry data
  // 5. Update the chart UI
  webSocket.onmessage = function onMessage(message) {
    try {
      const messageData = JSON.parse(message.data);
      console.log('Received message:', messageData);

      // Parse the payload
      let payload = messageData.IotData;
      
      // If the payload is a string (JSON), parse it
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          console.error('Error parsing payload string:', e);
          return;
        }
      }
      
      // Make sure we have a valid timestamp
      if (!messageData.MessageDate) {
        console.warn('Message missing timestamp');
        return;
      }

      // find or add device to list of tracked devices
      const existingDeviceData = trackedDevices.findDevice(messageData.DeviceId);

      if (existingDeviceData) {
        existingDeviceData.addData(
          messageData.MessageDate,
          payload.temperature,
          payload.powerLevel,
          payload.lightColor, 
          payload.intensity
        );
      } else {
        const newDeviceData = new DeviceData(messageData.DeviceId);
        trackedDevices.devices.push(newDeviceData);
        const numDevices = trackedDevices.getDevicesCount();
        deviceCount.innerText = numDevices === 1 ? `${numDevices} device` : `${numDevices} devices`;
        newDeviceData.addData(
          messageData.MessageDate,
          payload.temperature,
          payload.powerLevel,
          payload.lightColor, 
          payload.intensity
        );

        // add device to the UI list
        const node = document.createElement('option');
        const nodeText = document.createTextNode(messageData.DeviceId);
        node.appendChild(nodeText);
        listOfDevices.appendChild(node);

        // if this is the first device being discovered, auto-select it
        if (needsAutoSelect) {
          needsAutoSelect = false;
          listOfDevices.selectedIndex = 0;
          OnSelectionChange();
        }
      }

      // Update the traffic light and metrics for the currently selected device
      if (listOfDevices.selectedIndex >= 0) {
        const selectedDevice = trackedDevices.findDevice(listOfDevices[listOfDevices.selectedIndex].text);
        updateTrafficLight(selectedDevice.lightColor);
        updateMetrics(selectedDevice.intensity, selectedDevice.temperature, selectedDevice.powerLevel);
        
        // Add message to log if it exists
        if (document.getElementById('messageLog')) {
          const messageEntry = document.createElement('div');
          messageEntry.className = 'event-entry';
          const now = new Date().toLocaleTimeString();
          messageEntry.innerHTML = `<span class="event-time">[${now}]</span> Color=${payload.lightColor}, Temp=${payload.temperature.toFixed(1)}°C, Power=${payload.powerLevel.toFixed(1)}%`;
          const messageLog = document.getElementById('messageLog');
          messageLog.insertBefore(messageEntry, messageLog.firstChild);
        }
      }

      myLineChart.update();
    } catch (err) {
      console.error('Error processing message:', err);
    }
  };
});
