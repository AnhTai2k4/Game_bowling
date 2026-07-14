import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';

// Thay đổi IP này thành IP của ESP12 trong mạng LAN WiFi
const ESP12_IP = 'http://192.168.4.1'; 

export default function App() {
  const [isThrowing, setIsThrowing] = useState(false);
  
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
    const finalAngle = currentAngle.current.z.toFixed(2); // Giả sử trục Z quyết định độ chệch trái/phải

    // Bạn in ra cả 3 trục x, y, z lúc thả tay
console.log(`Góc X: ${currentAngle.current.x}, Góc Y: ${currentAngle.current.y}, Góc Z: ${currentAngle.current.z}`);

    console.log(`Lực ném: ${finalForce}, Hướng: ${finalAngle}`);
    sendDataToESP(finalForce, finalAngle);
  };

  const sendDataToESP = async (force: string, angle: string) => {
    try {
      const response = await fetch(`${ESP12_IP}/throw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force, angle }),
      });
      if (response.ok) {
        Alert.alert("Thành công", "Đã gửi tín hiệu ném bóng!");
      } else {
        Alert.alert("Lỗi", "Gửi dữ liệu thất bại");
      }
    } catch (error) {
      Alert.alert("Lỗi", "Không thể kết nối đến ESP12. Hãy kiểm tra WiFi.");
      console.log(error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BOWLING CONTROLLER</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>
          Trạng thái: {isThrowing ? "Đang vung tay..." : "Sẵn sàng"}
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
        1. Kết nối WiFi của điện thoại với mạng của ESP12.{'\n'}
        2. Nhấn giữ nút, thực hiện động tác ném bowling.{'\n'}
        3. Buông tay ra khỏi màn hình để thả bóng.
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
