Bluetooth bridge firmware for RetroCYD

BlueRetro v25.04 (HW1, "Wii extension" build) by Jacques Gagnon, unmodified.
Source: https://github.com/darthcloud/BlueRetro/tree/v25.04
Release: https://github.com/darthcloud/BlueRetro/releases/download/v25.04/v25.04_hw1.zip
Licence: Apache License 2.0, see LICENSE-BlueRetro.txt

Flash to a separate ESP32-WROOM-32 dev board (not to the CYD):
  esptool.py --chip esp32 write_flash 0x0 blueretro-wii-extension-merged.bin
or the parts: 0x1000 bootloader.bin, 0x8000 partition-table.bin,
0xd000 ota_data_initial.bin, 0x10000 BlueRetro_hw1_wii_extension.bin.
