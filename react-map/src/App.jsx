import React, { useEffect, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import outputData from './output.json';
import './App.css';

// 固定的目标公司坐标 (传音控股)
const COMPANY_LOCATION = [121.613589, 31.185108];
const COMPANY_NAME = "上海传音控股";

function App() {
  const mapContainer = useRef(null);

  // AMap 实例相关的 refs
  const mapRef = useRef(null);
  const AMapRef = useRef(null);
  const drivingRef = useRef(null);
  const companyMarkerRef = useRef(null);
  const markersRef = useRef([]); // 记录当前所有渲染的房源 Marker

  // 状态管理
  const [loaded, setLoaded] = useState(false);
  const [allProperties, setAllProperties] = useState([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [driveInfo, setDriveInfo] = useState(null);

  // 筛选条件状态
  const [minRent, setMinRent] = useState(1000);
  const [maxRent, setMaxRent] = useState(10000);
  const [searchName, setSearchName] = useState("");

  const amapConfig = {
    key: "85ebb18bce6e6b8bbbf5ddfdb1a865c4", // 高德 Web JS API Key
    version: "2.0",
    plugins: ['AMap.MarkerCluster', 'AMap.Driving']
  };

  // ---------------- 数据加载与清洗引擎 ----------------
  const processHousingData = (rawData) => {
    let propertyList = rawData?.Data?.Lst || [];
    propertyList = propertyList.filter(item => {
      const lat = parseFloat(item.LAT);
      const lng = parseFloat(item.LNG);
      const name = item.Name;
      const rent = item.MonthlyRent;
      if (isNaN(lat) || isNaN(lng) || !name || rent == null) return false;
      // 上海地区粗略边界
      if (lng < 120.8 || lng > 122.2 || lat < 30.6 || lat > 31.9) return false;
      return true;
    });
    setAllProperties(propertyList);
  };

  // 1. 初始化地图和插件，加载固定坐标和基础数据
  useEffect(() => {
    let map = null;

    AMapLoader.load(amapConfig)
      .then((AMap) => {
        AMapRef.current = AMap;

        // 创建地图对象
        map = new AMap.Map(mapContainer.current, {
          viewMode: "3D",
          zoom: 12,
          center: COMPANY_LOCATION, // 默认居中到公司
          mapStyle: "amap://styles/whitesmoke",
        });
        mapRef.current = map;

        // 初始化路径规划插件
        drivingRef.current = new AMap.Driving({
          map: map,
          hideMarkers: true,
        });

        // 打上固定的公司坐标 Marker
        companyMarkerRef.current = new AMap.Marker({
          position: new AMap.LngLat(...COMPANY_LOCATION),
          icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
          title: `目的地: ${COMPANY_NAME}`
        });
        map.add(companyMarkerRef.current);

        // ==== Github Pages 专用：优先读取本地浏览器缓存房源 ====
        const cachedData = localStorage.getItem('pd-housing-data');
        if (cachedData) {
          try {
            processHousingData(JSON.parse(cachedData));
          } catch (e) {
            processHousingData(outputData);
          }
        } else {
          // 若无缓存，使用打包内置静态样本房源
          processHousingData(outputData);
        }

        setLoaded(true);
      })
      .catch((e) => {
        console.error("地图加载失败:", e);
      });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------- Github Pages 专用：导入新数据文件 -----------------
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 清除可能存在的输入框痕迹
    e.target.value = null;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        if (!json || !json.Data || !json.Data.Lst) {
          throw new Error("JSON结构无法识别。请确保上传了正常的 output.json 格式。");
        }
        // 写入浏览器本地数据库 LocalStorage（大约可存5M）
        localStorage.setItem('pd-housing-data', JSON.stringify(json));
        // 触发内存与大屏渲染更新
        processHousingData(json);
        alert(`🎉 更新成功！大屏已重新挂载 ${json.Data.Lst.length} 条原始数据（应用清洗规则前）。`);
      } catch (err) {
        alert(`解析失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // 2. 根据筛选条件动态渲染彩色 Marker
  useEffect(() => {
    if (!loaded || !mapRef.current || !AMapRef.current) return;

    // 清除上一次渲染的房源标记
    if (markersRef.current.length > 0) {
      mapRef.current.remove(markersRef.current);
      markersRef.current = [];
    }

    // 根据筛选项过滤数据
    const validProps = allProperties.filter(p => {
      // 租金区间过滤
      const r = p.MonthlyRent;
      if (r < minRent || r > maxRent) return false;
      // 名称关键词过滤
      if (searchName && !p.Name.includes(searchName) && !p.AllName?.includes(searchName)) {
        return false;
      }
      return true;
    });

    setFilteredTotal(validProps.length);
    const AMap = AMapRef.current;
    const map = mapRef.current;
    const newMarkers = [];

    // 为每个通过过滤的房源创建带颜色的 Marker
    validProps.forEach(item => {
      const lng = parseFloat(item.LNG);
      const lat = parseFloat(item.LAT);
      const rent = item.MonthlyRent;

      // 按照租金价格划分颜色
      let dotColor = '#10b981'; // 默认绿色 < 2000
      if (rent >= 2000 && rent < 4000) dotColor = '#3b82f6'; // 蓝色
      else if (rent >= 4000 && rent < 6000) dotColor = '#f59e0b'; // 橙黄色
      else if (rent >= 6000) dotColor = '#ef4444'; // 红色

      // 动态彩色小圆点
      const customContent = `
        <div style="
          width: 14px; 
          height: 14px; 
          background-color: ${dotColor}; 
          border: 2px solid #fff; 
          border-radius: 50%; 
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          cursor: pointer;
        "></div>
      `;

      const marker = new AMap.Marker({
        position: new AMap.LngLat(lng, lat),
        title: item.Name,
        anchor: 'center',
        content: customContent
      });

      marker.on('click', () => {
        setDriveInfo(null);

        // 每次点击新房源时，清理以前的路线和虚线
        if (drivingRef.current) drivingRef.current.clear();
        if (window._currentPolyline) {
          map.remove(window._currentPolyline);
          window._currentPolyline = null;
        }

        if (companyMarkerRef.current && drivingRef.current) {
          const compPos = companyMarkerRef.current.getPosition();
          const origin = new AMap.LngLat(lng, lat);

          drivingRef.current.search(
            origin,
            compPos,
            (status, result) => {
              if (status === 'complete' && result.routes && result.routes.length > 0) {
                const timeMin = Math.round(result.routes[0].time / 60);
                const distKm = (result.routes[0].distance / 1000).toFixed(1);

                setDriveInfo({
                  house: item.Name,
                  time: timeMin,
                  dist: distKm
                });

                openHouseInfoBox(item, map, marker, distKm, timeMin);
              } else {
                // Fallback 算法：如果路线规划 API 由于跨海、无路或安全密钥拦截失败，则改用直线距离折算
                const distanceMeters = AMap.GeometryUtil.distance(origin, compPos);
                const estimatedDistKm = (distanceMeters * 1.3 / 1000).toFixed(1); // 1.3系数模拟实际道路弯折
                const estimatedTimeMin = Math.round((distanceMeters * 1.3 / 1000) / 25 * 60); // 按市区25km/h均速估算

                // 手绘画出虚线充当“预估路线”指引
                const polyline = new AMap.Polyline({
                  path: [origin, compPos],
                  isOutline: true,
                  outlineColor: '#ffffff',
                  borderWeight: 2,
                  strokeColor: "#3b82f6", // 蓝色虚线
                  strokeOpacity: 0.9,
                  strokeWeight: 4,
                  strokeStyle: "dashed",
                  lineJoin: 'round',
                  lineCap: 'round',
                  zIndex: 50,
                });
                map.add(polyline);
                window._currentPolyline = polyline; // 存入全局或ref均可，简单挂在window

                setDriveInfo({
                  house: item.Name,
                  time: estimatedTimeMin,
                  dist: estimatedDistKm
                });

                openHouseInfoBox(item, map, marker, estimatedDistKm, estimatedTimeMin, "寻路引擎受限，展示直线连接与折算预估");
              }
            }
          );
        } else {
          openHouseInfoBox(item, map, marker, null, null, "目标未就绪");
        }
      });

      newMarkers.push(marker);
    });

    map.add(newMarkers);
    markersRef.current = newMarkers;

  }, [allProperties, loaded, minRent, maxRent, searchName]);


  // ---- 辅助函数：打开房源信息气泡 ----
  const openHouseInfoBox = (item, map, marker, distKm, timeMin, errInfo = null) => {
    const AMap = AMapRef.current;

    let driveHtml = '';
    if (distKm && timeMin) {
      driveHtml = `
         <p><strong>距公司：</strong>大约 ${distKm} 公里</p>
         <p><strong>驾车通勤：</strong><span style="color:#e91e63;font-weight:bold">${timeMin} 分钟</span>
            ${errInfo ? `<br/><span style="color:#f59e0b;font-size:11px;line-height:1.2;">(${errInfo})</span>` : ''}
         </p>
       `;
    } else if (errInfo) {
      driveHtml = `<p style="color:red; font-size:12px">（${errInfo}）</p>`;
    }

    const content = `
      <div class="custom-popup">
        <div class="popup-header">
          <h3>${item.Name || '未知房源'}</h3>
        </div>
        <div class="popup-body">
          <p><strong>参考租金：</strong><span class="price">¥${item.MonthlyRent}/月</span></p>
          ${driveHtml}
          
          <div class="action-buttons">
            <a 
              href="https://select.pdgzf.com/houseDetails?Id=${item.Id}" 
              target="_blank" 
              class="btn-official"
            >
               🏠 官网查看房源详情
            </a>
            <a  
              href="https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.Name || '')}" 
              target="_blank" 
              class="btn-xhs"
            >
               📕 去小红书看攻略
            </a>
          </div>
        </div>
      </div>
    `;
    const infoWindow = new AMap.InfoWindow({
      isCustom: true,
      content: content,
      offset: new AMap.Pixel(0, -10)
    });
    infoWindow.open(map, marker.getPosition());
  };

  return (
    <div className="app-container">
      {/* 侧边悬浮面板 */}
      <div className="glass-panel">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>🗺️ 租房通勤大屏</h1>
            <p className="subtitle">找房 • 筛选 • 定制通勤预估</p>
          </div>

          <div className="upload-wrapper">
            <label htmlFor="file-upload" className="btn-upload" title="导入私人抓取的本地JSON包">
              📂 导入新数据
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* --------- 1. 目标状态 --------- */}
        <div className="panel-search">
          <h3>🏢 固定的目标打卡地</h3>
          <div className="company-status">
            <p>📍 <strong>{COMPANY_NAME}</strong></p>
            <p className="sub-info">坐标: {COMPANY_LOCATION.join(", ")}</p>
          </div>
        </div>

        {/* --------- 2. 筛选项 --------- */}
        <div className="panel-filters">
          <h3>🔍 房源精细筛选与图例</h3>

          <div className="filter-group">
            <label>租金范围 (¥/月)</label>
            <div className="range-inputs">
              <input
                type="number"
                min="0"
                step="500"
                value={minRent}
                onChange={(e) => setMinRent(Number(e.target.value))}
                className="filter-input input-half"
              />
              <span className="dash">-</span>
              <input
                type="number"
                min="0"
                step="500"
                value={maxRent}
                onChange={(e) => setMaxRent(Number(e.target.value))}
                className="filter-input input-half"
              />
            </div>
          </div>

          <div className="filter-group">
            <label>包含名称/关键词</label>
            <input
              type="text"
              placeholder="例如：御翠园"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="legend-box">
            <div className="legend-item"><span className="dot dot-green"></span>&lt; 2000</div>
            <div className="legend-item"><span className="dot dot-blue"></span>2000-4000</div>
            <div className="legend-item"><span className="dot dot-orange"></span>4000-6000</div>
            <div className="legend-item"><span className="dot dot-red"></span>&ge; 6000</div>
          </div>
        </div>

        <div className="panel-stats">
          <div className="stat-card">
            <span className="stat-title">符合条件房源</span>
            <span className="stat-value">{filteredTotal} <small>套</small></span>
          </div>
        </div>

        {driveInfo && (
          <div className="panel-route-info">
            <h4>🚗 当前测算路线</h4>
            <p>起点: <strong className="highlight">{driveInfo.house}</strong></p>
            <div className="route-details">
              <div className="route-item">
                <div className="route-val">{driveInfo.dist} <span>km</span></div>
                <div className="route-lbl">驾车距离</div>
              </div>
              <div className="route-item">
                <div className="route-val">{driveInfo.time} <span>min</span></div>
                <div className="route-lbl">预计耗时</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 地图主体 */}
      {!loaded && <div className="map-loading">正在初始化引擎并加载颜色点位...</div>}
      <div id="map-container" ref={mapContainer} className="map-wrapper"></div>
    </div>
  );
}

export default App;
