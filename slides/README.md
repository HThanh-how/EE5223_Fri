# EE5223 · Nhóm 5

Mở `dist/EE5223-NPU-slides.html` trong Chrome; tệp hoạt động offline. Cần WebGL để hiển thị cảnh 3D.

Mũi tên, PageUp/PageDown, Space hoặc nút trên thanh công cụ chuyển slide. Nhấp chuột phải trên sân khấu để tới slide kế; nút bên Back/Forward chuyển trước/sau. Shift + chuột phải mở menu công cụ. Nhấn S tại slide kết quả chu kỳ để đổi CNN/LSTM. N: ghi chú, O: tổng quan, P: presenter, D: bút, F: toàn màn hình, ?: trợ giúp.

Để dựng lại: cài Node.js rồi chạy `node build.js` trong thư mục này. Nguồn và font đã được nhúng trong `src`, Three.js trong `vendor`; không cần mạng khi dựng hoặc trình chiếu. `?static#N` chọn khung tĩnh của slide N; `?selftest` chạy kiểm tra các slide.

Bộ slide có 17 slide; mọi slide nội dung là sơ đồ SVG tương tác (nguồn `src/deck.js`). Rê chuột vào một khối: khối và các dây nối của nó sáng lên, các khối còn lại mờ đi, và dòng giải thích hiện ở dưới sơ đồ. Nét xanh lá là dữ liệu, cam là điều khiển, xanh dương là bộ nhớ. Hình động có nghĩa: làn sóng dữ liệu qua lưới PE, dữ liệu chạy qua các thanh ghi trễ, nhân hàng với cột trong GEMM, giá trị float được làm tròn về lưới INT8, thanh biểu đồ lấy từ log thật.
