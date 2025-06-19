const backendUrl = 'postgresql://postgres:IjREPrBTNlTCwEhpOAjePMzidVNbdzBo@postgres.railway.internal:5432/railway' // Cập nhật với URL Railway.app của bạn
const applicationAddress = '0xb37bF0176558B9e76507b79d38D4696DD1805bee';
const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

let provider;
let signer;

async function connectWallet() {
    if (window.ethereum) {
        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x2105',
                    chainName: 'Base Mainnet',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['[invalid url, do not cite]'],
                    blockExplorerUrls: ['[invalid url, do not cite]']
                }]
            });
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            const address = await signer.getAddress();
            document.getElementById('walletAddress').textContent = address;
        } catch (error) {
            console.error('Wallet connection error:', error);
            alert('Không thể kết nối ví. Vui lòng đảm bảo ví của bạn hỗ trợ mạng Base và các phương thức cần thiết.');
        }
    } else {
        alert('Vui lòng cài đặt MetaMask hoặc ví khác hỗ trợ mạng Base.');
    }
}

async function placeBet() {
    if (!signer) {
        alert('Vui lòng kết nối ví của bạn trước');
        return;
    }
    const betAmount = document.getElementById('betAmount').value;
    const numbers = document.getElementById('numbers').value;
    if (!betAmount || !numbers) {
        alert('Vui lòng nhập số tiền cược và các số');
        return;
    }
    const numbersArray = numbers.split(',').map(num => num.trim());
    if (numbersArray.some(num => !/^\d{2}$/.test(num))) {
        alert('Các số phải là hai chữ số, cách nhau bằng dấu phẩy');
        return;
    }
    const totalPositions = numbersArray.length;
    const totalCost = (parseFloat(betAmount) * totalPositions) + 0.10;
    document.getElementById('totalCost').textContent = totalCost.toFixed(2) + ' USDC';
    if (!confirm(`Tổng chi phí: ${totalCost.toFixed(2)} USDC. Tiếp tục?`)) {
        return;
    }
    const usdcContract = new ethers.Contract(usdcContractAddress, [
        'function transfer(address to, uint256 amount) public returns (bool)'
    ], signer);
    const amountInUnits = ethers.utils.parseUnits(totalCost.toString(), 6);
    try {
        const tx = await usdcContract.transfer(applicationAddress, amountInUnits);
        await tx.wait();
        console.log('Giao dịch thành công:', tx.hash);
        const response = await fetch(`${backendUrl}/bets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: await signer.getAddress(),
                numbers: numbers,
                amountPerPosition: betAmount,
                txHash: tx.hash
            })
        });
        const data = await response.json();
        console.log('Cược đã được ghi nhận:', data);
        alert('Đặt cược thành công');
    } catch (error) {
        console.error('Lỗi khi đặt cược:', error);
        alert('Không thể đặt cược');
    }
}

async function donate() {
    if (!signer) {
        alert('Vui lòng kết nối ví của bạn trước');
        return;
    }
    const donationAmount = document.getElementById('donationAmount').value;
    if (!donationAmount) {
        alert('Vui lòng nhập số tiền quyên góp');
        return;
    }
    const usdcContract = new ethers.Contract(usdcContractAddress, [
        'function transfer(address to, uint256 amount) public returns (bool)'
    ], signer);
    const amountInUnits = ethers.utils.parseUnits(donationAmount, 6);
    try {
        const tx = await usdcContract.transfer(applicationAddress, amountInUnits);
        await tx.wait();
        console.log('Quyên góp thành công:', tx.hash);
        alert('Cảm ơn bạn đã quyên góp');
    } catch (error) {
        console.error('Lỗi khi quyên góp:', error);
        alert('Không thể quyên góp');
    }
}

async function displayResults(date) {
    try {
        const response = await fetch(`${backendUrl}/results?date=${date}`);
        const data = await response.json();
        if (data.winningNumbers) {
            const numbers = data.winningNumbers.split(',');
            for (let i = 0; i < 5; i++) {
                document.getElementById(`result${i+1}`).textContent = numbers[i] || '--';
            }
        } else {
            for (let i = 1; i <= 5; i++) {
                document.getElementById(`result${i}`).textContent = '--';
            }
            if (data.error) {
                console.error('Lỗi từ server:', data.error);
            }
        }
    } catch (error) {
        console.error('Lỗi khi lấy kết quả:', error);
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`result${i}`).textContent = '--';
        }
    }
}

async function displayStats(date) {
    try {
        const response = await fetch(`${backendUrl}/stats?date=${date}`);
        const data = await response.json();
        if (data.totalBets !== undefined && data.ticketsSold !== undefined) {
            document.getElementById('totalBets').textContent = data.totalBets + ' USDC';
            document.getElementById('ticketsSold').textContent = data.ticketsSold;
        } else {
            document.getElementById('totalBets').textContent = '0 USDC';
            document.getElementById('ticketsSold').textContent = '0';
            if (data.error) {
                console.error('Lỗi từ server:', data.error);
            }
        }
    } catch (error) {
        console.error('Lỗi khi lấy thống kê:', error);
        document.getElementById('totalBets').textContent = '0 USDC';
        document.getElementById('ticketsSold').textContent = '0';
    }
}

async function displayRecentWinners() {
    try {
        const response = await fetch(`${backendUrl}/recent-winners`);
        const data = await response.json();
        const winnersList = document.getElementById('recentWinners');
        winnersList.innerHTML = '';
        if (Array.isArray(data)) {
            if (data.length === 0) {
                winnersList.innerHTML = '<li>Chưa có</li>';
            } else {
                data.forEach(winner => {
                    const li = document.createElement('li');
                    li.textContent = `${winner.walletAddress} đã thắng ${winner.payout} USDC vào ${winner.date}`;
                    winnersList.appendChild(li);
                });
            }
        } else {
            console.error('Dự kiến là một mảng cho người chiến thắng gần đây, nhận được:', data);
            winnersList.innerHTML = '<li>Lỗi khi lấy người chiến thắng</li>';
        }
    } catch (error) {
        console.error('Lỗi khi lấy người chiến thắng gần đây:', error);
        const winnersList = document.getElementById('recentWinners');
        winnersList.innerHTML = '<li>Lỗi khi lấy người chiến thắng</li>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('placeBet').addEventListener('click', placeBet);
    document.getElementById('donate').addEventListener('click', donate);
    document.getElementById('fetchResults').addEventListener('click', () => {
        const date = document.getElementById('resultDate').value;
        if (date) {
            displayResults(date);
            displayStats(date);
        } else {
            alert('Vui lòng chọn ngày');
        }
    });
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('resultDate').value = today;
    displayResults(today);
    displayStats(today);
    displayRecentWinners();
});