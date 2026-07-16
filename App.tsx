import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Image } from 'react-native';
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
  const [isPositioning, setIsPositioning] = useState(false);
  const [lastThrow, setLastThrow] = useState({ force: '0', angle: '0' });
  const [statusMsg, setStatusMsg] = useState('Sẵn sàng');
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  // Lưu trữ các giá trị đo được
  const maxForce = useRef(0);
  const currentAngle = useRef({ x: 0, y: 0, z: 0 });
  const currentAccel = useRef({ x: 0, y: 0, z: 0 });
  const positionInterval = useRef<any>(null);

  // Lắng nghe gói tin từ ESP gửi về (ví dụ {"navigated":1} hay {"navigated":2})
  useEffect(() => {
    const serverSocket = dgram.createSocket({ type: 'udp4' });
    serverSocket.bind(UDP_PORT, (err: any) => {
      if (err) {
        console.log('[UDP Server Error]:', err);
      } else {
        console.log(`[UDP Server] Đang lắng nghe từ ESP trên cổng ${UDP_PORT}...`);
      }
    });

    serverSocket.on('message', (msg, rinfo) => {
      try {
        const str = msg.toString('utf8');
        console.log(`[UDP Received] từ ${rinfo.address}:${rinfo.port} -> ${str}`);
        const data = JSON.parse(str);
        if (data.navigated === 1) {
          setCurrentPage(1);
          setStatusMsg('Sẵn sàng');
        } else if (data.navigated === 2) {
          setCurrentPage(2);
          setStatusMsg('Sẵn sàng');
        }
      } catch (e) {
        console.log('[UDP Parse Error]:', e);
      }
    });

    return () => {
      serverSocket.close();
    };
  }, []);

  const handlePressStart = () => {
    try {
      const socket = dgram.createSocket({ type: 'udp4' });
      const message = JSON.stringify({ navigateTo: 2 });
      const buffer = Buffer.from(message);

      socket.bind(0, (bindError: any) => {
        if (bindError) return;
        socket.send(buffer, 0, buffer.length, UDP_PORT, UDP_HOST, () => {
          console.log(`[UDP Navigate] Đã gửi: ${message}`);
          socket.close();
          setCurrentPage(2);
        });
      });
    } catch (e) {
      console.error('[UDP Navigate Error]:', e);
      setCurrentPage(2);
    }
  };

  const handlePressHome = () => {
    try {
      const socket = dgram.createSocket({ type: 'udp4' });
      const message = JSON.stringify({ navigateTo: 1 });
      const buffer = Buffer.from(message);

      socket.bind(0, (bindError: any) => {
        if (bindError) return;
        socket.send(buffer, 0, buffer.length, UDP_PORT, UDP_HOST, () => {
          console.log(`[UDP Navigate] Đã gửi: ${message}`);
          socket.close();
          setCurrentPage(1);
        });
      });
    } catch (e) {
      console.error('[UDP Navigate Error]:', e);
      setCurrentPage(1);
    }
  };

  useEffect(() => {
    // Cài đặt tần suất cập nhật cảm biến (ví dụ 50ms / lần)
    Accelerometer.setUpdateInterval(50);
    Gyroscope.setUpdateInterval(50);

    let accelSubscription: any;
    let gyroSubscription: any;

    if (isThrowing || isPositioning) {
      if (isThrowing) {
        // Đặt lại giá trị khi bắt đầu ném
        maxForce.current = 0;
        setStatusMsg('Đang vung tay...');
      } else if (isPositioning) {
        setStatusMsg('Đang chỉnh vị trí ngang...');
      }

      // Đọc gia tốc kế để tính Lực (lúc ném) và độ trượt Ox (lúc chọn vị trí)
      accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
        currentAccel.current = { x, y, z };
        if (isThrowing) {
          const force = Math.sqrt(x * x + y * y + z * z);
          if (force > maxForce.current) {
            maxForce.current = force;
          }
        }
      });

      // Đọc con quay hồi chuyển cho ném bóng
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
  }, [isThrowing, isPositioning]);

  const handleStartPosition = () => {
    setIsPositioning(true);
    setStatusMsg('Đang chỉnh vị trí ngang...');
    
    if (positionInterval.current) clearInterval(positionInterval.current);
    positionInterval.current = setInterval(() => {
      try {
        const socket = dgram.createSocket({ type: 'udp4' });
        // Đo chuyển động trượt tịnh tiến ngang trên trục Ox của Gia tốc kế
        const posVal = parseFloat(currentAccel.current.x.toFixed(2));
        const message = JSON.stringify({ type: 'position', position: posVal});
        const buffer = Buffer.from(message);

        socket.bind(0, (bindError: any) => {
          if (bindError) return;
          socket.send(buffer, 0, buffer.length, UDP_PORT, UDP_HOST, () => {
            socket.close();
          });
        });
      } catch (e) {
        console.error('[UDP Position Error]:', e);
      }
    }, 17);
  };

  const handleEndPosition = () => {
    setIsPositioning(false);
    if (positionInterval.current) {
      clearInterval(positionInterval.current);
      positionInterval.current = null;
    }
    setStatusMsg('Đã chốt vị trí! Sẵn sàng ném.');
  };

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
      {currentPage === 1 ? (
        // Trang chủ (Step 1)
        <View style={styles.pageContent}>
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>BOWLING GAME</Text>
          </View>
          

          <TouchableOpacity 
            style={styles.startButton}
            onPress={handlePressStart}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>PLAY</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Trang chơi game (Step 2)
        <View style={styles.pageContent}>
          <View style={styles.topHeader}>
            <View style={styles.headerBarMini}>
              <Text style={styles.headerTitleMini}>BOWLING CONTROLLER</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.homeImageButton}
              onPress={handlePressHome}
              activeOpacity={0.8}
            >
              <Image source={require('./assets/home.png')} style={styles.homeIconImage} resizeMode="contain" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.centerContainer}>
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.posButton, isPositioning && styles.posButtonActive]}
                onPressIn={handleStartPosition}
                onPressOut={handleEndPosition}
                activeOpacity={0.85}
              >
                <Text style={styles.posButtonText}>
                  {isPositioning ? "ĐANG CHỈNH NGANG..." : "CHỌN VỊ TRÍ"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.ballButton, isThrowing && styles.ballButtonActive]}
                onPressIn={handleStartThrow}
                onPressOut={handleEndThrow}
                activeOpacity={0.85}
              >
                <Image 
                  source={require('./assets/bowling.png')} 
                  style={styles.bowlingImage} 
                  resizeMode="contain" 
                />
              </TouchableOpacity>

              <Text style={styles.posButtonText2}>
                GIỮ VÀ VUNG TAY ĐỂ NÉM
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A3B32', // Nâu ấm chủ đạo
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
  },
  pageContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 20,
  },
  headerBar: {
    backgroundColor: '#5C3A21',
    borderWidth: 4,
    borderColor: '#3B2211',
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFD500', // Vàng gold
    letterSpacing: 2,
    textAlign: 'center',
  },
  subTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFCC00',
    letterSpacing: 1,
  },
  startButton: {
    marginTop: -150,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#FFCC00', // Vàng rực như ảnh
    borderWidth: 10,
    borderColor: '#FF9900', // Viền cam vàng
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 15,
  },
  startButtonText: {
    color: '#4A2E13', // Chữ nâu đậm
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 3,
  },
  startButtonSub: {
    color: '#5C3A21',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  infoBar: {
    backgroundColor: 'rgba(92, 58, 33, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#8D6E63',
  },
  infoText: {
    color: '#FFD500',
    fontSize: 15,
    fontWeight: '600',
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  headerBarMini: {
    backgroundColor: '#5C3A21',
    borderWidth: 3,
    borderColor: '#3B2211',
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  headerTitleMini: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFD500',
  },
  homeImageButton: {
    padding: 5,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIconImage: {
    width: 50,
    height: 50,
  },
  centerContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    gap: 30,
  },
  posButton: {
    width: 230,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#8D6E63', // Nâu đồng
    borderWidth: 3,
    borderColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  posButtonActive: {
    backgroundColor: '#FF9900',
    transform: [{ scale: 0.95 }],
  },
  posButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  posButtonText2: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: -10
  },
  ballButton: {
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballButtonActive: {
    transform: [{ scale: 0.94 }],
  },
  bowlingImage: {
    width: 300,
    height: 300,
    marginTop: 50
  },
});
