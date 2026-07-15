import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';

// Đảm bảo Buffer khả dụng toàn cục cho react-native-udp
global.Buffer = global.Buffer || Buffer;

// Cấu hình địa chỉ IP và Port UDP của ESP8266
const UDP_HOST = '192.168.4.1';
const UDP_PORT = 4210;

export default function App() {
  const [isThrowing, setIsThrowing] = useState(false);
  const [lastThrow, setLastThrow] = useState({ force: '0', angle: '0' });
  const [statusMsg, setStatusMsg] = useState('Sẵn sàng');
  
  // Lưu trữ các giá trị đo được
  const maxForce = useRef(0);
  const currentAngle = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    // Cài đặt tần suất cập nhật cảm biến (ví dụ 50ms / lần)
    Accelerometer.setUpdateInterval(50);
    Gyroscope.setUpdateInterval(50);

    let accelSubscription: any;
    let gyroSubscription: any;

    if (isThrowing) {
      // Đặt lại giá trị khi bắt đầu ném
      maxForce.current = 0;
      setStatusMsg('Đang vung tay...');

      // Đọc gia tốc kế để tính Lực
      accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
        // Tính độ lớn gia tốc tổng hợp
        const force = Math.sqrt(x * x + y * y + z * z);
        if (force > maxForce.current) {
          maxForce.current = force;
        }
      });

      // Đọc con quay hồi chuyển để tính Hướng
      gyroSubscription = Gyroscope.addListener(({ x, y, z }) => {
        currentAngle.current = { x, y, z };
      });
    } else {
      setStatusMsg('Sẵn sàng');
    }

    return () => {
      if (accelSubscription) accelSubscription.remove();
      if (gyroSubscription) gyroSubscription.remove();
    };
  }, [isThrowing]);

  const handleStartThrow = () => {
    setIsThrowing(true);
  };

  const handleEndThrow = () => {
    setIsThrowing(false);
    
    // Xử lý dữ liệu thô thành thông số game
    // Trừ đi 1G trọng lực (hoặc tùy theo logic hiệu chuẩn của bạn)
    const finalForce = Math.max(0, maxForce.current - 1).toFixed(2); 
    // Với tư thế cầm máy cạnh viền hướng trước sau (mặt ngửa trái, cạnh dài trên dưới), trục X là trục thẳng đứng -> gyro.x là độ bẻ lái trái/phải!
    const finalAngle = currentAngle.current.x.toFixed(2);

    // In log ra Terminal
    console.log(`Góc X: ${currentAngle.current.x}, Góc Y: ${currentAngle.current.y}, Góc Z: ${currentAngle.current.z}`);
    console.log(`[UDP] Lực ném: ${finalForce}, Hướng: ${finalAngle}`);
    
    // Cập nhật giao diện màn hình
    setLastThrow({ force: finalForce, angle: finalAngle });
    
    // Gửi dữ liệu qua UDP tới ESP8266
    sendDataViaUDP(finalForce, finalAngle);
  };

  const sendDataViaUDP = (force: string, angle: string) => {
    try {
      // Tạo UDP Socket (IPv4)
      const socket = dgram.createSocket({ type: 'udp4' });
      const message = JSON.stringify({ force: parseFloat(force), angle: - parseFloat(angle) });
      const buffer = Buffer.from(message);

      // BẮT BUỘC với react-native-udp: Phải bind socket vào cổng local bất kỳ (0) trước khi gửi
      socket.bind(0, (bindError: any) => {
        if (bindError) {
          console.error('[UDP Bind Error]:', bindError);
          setStatusMsg('Lỗi khởi tạo cổng UDP');
          return;
        }

        // Gửi gói tin UDP tới 192.168.4.1:4210
        socket.send(buffer, 0, buffer.length, UDP_PORT, UDP_HOST, (error) => {
          if (error) {
            console.error('[UDP Error]:', error);
            setStatusMsg('Gửi UDP thất bại!');
            Alert.alert("Lỗi UDP", `Không thể gửi dữ liệu tới ${UDP_HOST}:${UDP_PORT}`);
          } else {
            console.log(`[UDP Success] Đã gửi: ${message} -> ${UDP_HOST}:${UDP_PORT}`);
            setStatusMsg('Đã gửi UDP thành công!');
          }
          // Đóng socket sau khi gửi
          socket.close();
        });
      });
    } catch (error) {
      console.error('[UDP Exception]:', error);
      Alert.alert("Lỗi Socket", "Khởi tạo kết nối UDP thất bại.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BOWLING CONTROLLER</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>
          Trạng thái: {statusMsg}
        </Text>
        <Text style={styles.resultText}>
          Lần ném cuối - Lực: {lastThrow.force} | Hướng: {lastThrow.angle}
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.button, isThrowing && styles.buttonActive]}
        onPressIn={handleStartThrow}
        onPressOut={handleEndThrow}
      >
        <Text style={styles.buttonText}>
          {isThrowing ? "THẢ BÓNG" : "GIỮ & VUNG TAY"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.instructions}>
        1. Kết nối WiFi điện thoại với mạng của ESP8266 ({UDP_HOST}).{'\n'}
        2. Nhấn giữ nút, thực hiện động tác ném bowling.{'\n'}
        3. Buông tay ra khỏi màn hình để thả bóng qua UDP port {UDP_PORT}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00E5FF',
    marginBottom: 40,
  },
  statusBox: {
    marginBottom: 40,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#333',
    width: '100%',
    alignItems: 'center',
  },
  statusText: {
    color: '#FFF',
    fontSize: 18,
    marginBottom: 10,
  },
  resultText: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  button: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#FF3D00',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#FF3D00',
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  buttonActive: {
    backgroundColor: '#00C853',
    shadowColor: '#00C853',
    transform: [{ scale: 0.95 }],
  },
  buttonText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  instructions: {
    color: '#AAA',
    marginTop: 50,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
  }
});
