import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4, Address, toNano, fromNano, Cell, beginCell } from '@ton/ton';
import { TonClient } from '@ton/ton';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

export class WalletManager {
    constructor() {
        this.client = null;
        this.masterWallet = null;
        this.childWallets = [];
        this.dataDir = './data';
        this.walletsDbPath = process.env.WALLETS_DB_PATH || './data/wallets.json';
        this.masterWalletPath = process.env.MASTER_WALLET_PATH || './data/master_wallet.json';
        this.simulatedBalance = 0; // For simulating TON balance
    }
    
    async initialize() {
        console.log('🔧 Initializing Wallet Manager...');
        
        // Create data directory
        await fs.ensureDir(this.dataDir);
        
        // Initialize TON client
        const isTestnet = process.env.TON_NETWORK !== 'mainnet';
        this.client = new TonClient({
            endpoint: isTestnet 
                ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
                : 'https://toncenter.com/api/v2/jsonRPC',
            apiKey: process.env.TON_API_KEY
        });
        
        // Load existing wallets
        await this.loadWallets();
        
        // Create master wallet if doesn't exist
        if (!this.masterWallet) {
            await this.createMasterWallet();
        }
        
        console.log('✅ Wallet Manager initialized successfully');
    }
    
    async createMasterWallet() {
        console.log('👑 Creating master wallet...');
        
        try {
            const mnemonic = await mnemonicNew(24);
            const keyPair = await mnemonicToPrivateKey(mnemonic);
            
            const workchain = 0;
            const wallet = WalletContractV4.create({
                workchain,
                publicKey: keyPair.publicKey
            });
            
            this.masterWallet = {
                address: wallet.address.toString(),
                mnemonic: mnemonic,
                publicKey: keyPair.publicKey.toString('hex'),
                privateKey: keyPair.secretKey.toString('hex'),
                workchain: workchain,
                createdAt: new Date().toISOString(),
                type: 'master'
            };
            
            await this.saveMasterWallet();
            console.log(`✅ Master wallet created: ${this.masterWallet.address}`);
            
        } catch (error) {
            console.error('❌ Error creating master wallet:', error);
            throw error;
        }
    }
    
    async createChildWallets(count) {
        console.log(`👶 Creating ${count} child wallets...`);
        
        const newWallets = [];
        const batchSize = 10; // Process in batches to avoid memory issues
        
        try {
            for (let i = 0; i < count; i += batchSize) {
                const batchEnd = Math.min(i + batchSize, count);
                const batchPromises = [];
                
                for (let j = i; j < batchEnd; j++) {
                    batchPromises.push(this.createSingleChildWallet(j + 1));
                }
                
                const batchWallets = await Promise.all(batchPromises);
                newWallets.push(...batchWallets);
                
                // Show progress
                console.log(`📈 Progress: ${Math.min(batchEnd, count)}/${count} wallets created`);
            }
            
            // Add to existing child wallets
            this.childWallets.push(...newWallets);
            
            // Save to database
            await this.saveWallets();
            
            console.log(`✅ Successfully created ${count} child wallets`);
            return newWallets;
            
        } catch (error) {
            console.error('❌ Error creating child wallets:', error);
            throw error;
        }
    }
    
    async createSingleChildWallet(index) {
        try {
            const mnemonic = await mnemonicNew(24);
            const keyPair = await mnemonicToPrivateKey(mnemonic);
            
            const workchain = 0;
            const wallet = WalletContractV4.create({
                workchain,
                publicKey: keyPair.publicKey
            });
            
            return {
                id: `child_${Date.now()}_${index}`,
                address: wallet.address.toString(),
                mnemonic: mnemonic,
                publicKey: keyPair.publicKey.toString('hex'),
                privateKey: keyPair.secretKey.toString('hex'),
                workchain: workchain,
                createdAt: new Date().toISOString(),
                type: 'child',
                index: this.childWallets.length + index,
                balance: '0'
            };
            
        } catch (error) {
            console.error(`❌ Error creating child wallet ${index}:`, error);
            throw error;
        }
    }
    
    async loadWallets() {
        try {
            // Load master wallet
            if (await fs.pathExists(this.masterWalletPath)) {
                const masterData = await fs.readJson(this.masterWalletPath);
                this.masterWallet = masterData;
                console.log('📁 Master wallet loaded from file');
            }
            
            // Load child wallets
            if (await fs.pathExists(this.walletsDbPath)) {
                const walletsData = await fs.readJson(this.walletsDbPath);
                this.childWallets = walletsData.children || [];
                console.log(`📁 Loaded ${this.childWallets.length} child wallets from file`);
            }
            
        } catch (error) {
            console.error('❌ Error loading wallets:', error);
            this.childWallets = [];
        }
    }
    
    async saveWallets() {
        try {
            const walletsData = {
                children: this.childWallets,
                lastUpdated: new Date().toISOString(),
                totalCount: this.childWallets.length
            };
            
            await fs.writeJson(this.walletsDbPath, walletsData, { spaces: 2 });
            console.log(`💾 Saved ${this.childWallets.length} child wallets to database`);
            
        } catch (error) {
            console.error('❌ Error saving wallets:', error);
            throw error;
        }
    }
    
    async saveMasterWallet() {
        try {
            await fs.writeJson(this.masterWalletPath, this.masterWallet, { spaces: 2 });
            console.log('💾 Master wallet saved to file');
            
        } catch (error) {
            console.error('❌ Error saving master wallet:', error);
            throw error;
        }
    }
    
    async getAllWallets() {
        return {
            master: this.masterWallet,
            children: this.childWallets,
            totalChildren: this.childWallets.length
        };
    }
    
    async getMasterWalletBalance() {
        if (!this.masterWallet) {
            throw new Error('Master wallet not found');
        }
        
        try {
            const address = Address.parse(this.masterWallet.address);
            const balance = await this.client.getBalance(address);
            return (Number(balance) / 1e9).toFixed(4); // Convert from nanoton to TON
            
        } catch (error) {
            console.error('❌ Error getting master wallet balance:', error);
            return this.simulatedBalance.toFixed(4);
        }
    }
    
    async getChildWalletBalance(childWallet) {
        try {
            const address = Address.parse(childWallet.address);
            const balance = await this.client.getBalance(address);
            return (Number(balance) / 1e9).toFixed(4); // Convert from nanoton to TON
            
        } catch (error) {
            console.error(`❌ Error getting balance for ${childWallet.address}:`, error);
            return '0';
        }
    }
    
    getWalletStats() {
        return {
            masterWallet: this.masterWallet ? 1 : 0,
            childWallets: this.childWallets.length,
            totalWallets: (this.masterWallet ? 1 : 0) + this.childWallets.length
        };
    }
    
    // Get current TON price from CoinGecko API
    async getTonPrice() {
        try {
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
            return response.data['the-open-network'].usd;
        } catch (error) {
            console.error('❌ Error fetching TON price:', error.message);
            // Fallback price if API fails
            return 2.5;
        }
    }
    
    // Simulate adding TON to master wallet (for testing without real transactions)
    async simulateAddTonToMaster(tonAmount) {
        this.simulatedBalance += tonAmount;
        console.log(`💡 Simulated: Added ${tonAmount} TON to master wallet`);
        console.log(`📊 Simulated Master Balance: ${this.simulatedBalance} TON`);
    }
    
    // Get master wallet balance (including simulated balance for testing)
    async getMasterWalletBalance() {
        if (!this.masterWallet) {
            throw new Error('Master wallet not found');
        }
        
        try {
            const address = Address.parse(this.masterWallet.address);
            const realBalance = await this.client.getBalance(address);
            const realTonBalance = Number(fromNano(realBalance));
            
            // Add simulated balance for testing
            const totalBalance = realTonBalance + this.simulatedBalance;
            
            return totalBalance.toFixed(4);
            
        } catch (error) {
            console.error('❌ Error getting master wallet balance:', error);
            // Return only simulated balance if real balance check fails
            return this.simulatedBalance.toFixed(4);
        }
    }
    
    // Distribute TON from master wallet to all child wallets equally
    async distributeTonToChildren(totalAmount) {
        if (!this.masterWallet || this.childWallets.length === 0) {
            throw new Error('Master wallet or child wallets not found');
        }
        
        try {
            const amountPerWallet = totalAmount / this.childWallets.length;
            const results = {
                success: false,
                successCount: 0,
                failedCount: 0,
                transactions: []
            };
            
            console.log(`💸 Distributing ${amountPerWallet.toFixed(6)} TON to each of ${this.childWallets.length} wallets...`);
            
            // In testnet, we'll simulate the transfers
            const isTestnet = process.env.TON_NETWORK !== 'mainnet';
            
            if (isTestnet) {
                // Simulate transfers in testnet
                for (let i = 0; i < this.childWallets.length; i++) {
                    const wallet = this.childWallets[i];
                    
                    try {
                        // Simulate transfer delay
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        console.log(`📤 Simulating transfer to wallet ${i + 1}/${this.childWallets.length}: ${wallet.address.slice(0, 10)}...`);
                        
                        // Update child wallet balance in memory
                        wallet.balance = (parseFloat(wallet.balance || '0') + amountPerWallet).toFixed(6);
                        
                        results.successCount++;
                        results.transactions.push({
                            to: wallet.address,
                            amount: amountPerWallet,
                            status: 'simulated_success'
                        });
                        
                    } catch (error) {
                        console.error(`❌ Failed to simulate transfer to ${wallet.address}:`, error.message);
                        results.failedCount++;
                        results.transactions.push({
                            to: wallet.address,
                            amount: amountPerWallet,
                            status: 'failed',
                            error: error.message
                        });
                    }
                }
                
                // Deduct from simulated master balance
                this.simulatedBalance = Math.max(0, this.simulatedBalance - totalAmount);
                
            } else {
                // Real transfers on mainnet (implement actual TON transfers here)
                for (let i = 0; i < this.childWallets.length; i++) {
                    const wallet = this.childWallets[i];
                    
                    try {
                        // This would be real transfer logic
                        const transferResult = await this.sendTonTransfer(
                            wallet.address, 
                            amountPerWallet
                        );
                        
                        results.successCount++;
                        results.transactions.push({
                            to: wallet.address,
                            amount: amountPerWallet,
                            status: 'success',
                            txHash: transferResult.hash
                        });
                        
                        console.log(`✅ Sent ${amountPerWallet} TON to ${wallet.address.slice(0, 10)}...`);
                        
                    } catch (error) {
                        console.error(`❌ Failed to send to ${wallet.address}:`, error.message);
                        results.failedCount++;
                        results.transactions.push({
                            to: wallet.address,
                            amount: amountPerWallet,
                            status: 'failed',
                            error: error.message
                        });
                    }
                }
            }
            
            // Save updated wallet data
            await this.saveWallets();
            
            results.success = results.successCount > 0;
            
            // Save distribution report
            await this.saveDistributionReport(results, totalAmount);
            
            return results;
            
        } catch (error) {
            console.error('❌ Error in distribution process:', error);
            throw error;
        }
    }
    
    // Send actual TON transfer (for mainnet)
    async sendTonTransfer(toAddress, amount) {
        // This is a placeholder for real TON transfer implementation
        // In production, you would implement the actual transfer logic here
        throw new Error('Real TON transfers not implemented yet - use testnet for simulation');
    }
    
    // Save distribution report
    async saveDistributionReport(results, totalAmount) {
        try {
            const reportPath = `./data/distribution_${Date.now()}.json`;
            const report = {
                timestamp: new Date().toISOString(),
                totalAmount: totalAmount,
                totalWallets: this.childWallets.length,
                amountPerWallet: totalAmount / this.childWallets.length,
                results: results
            };
            
            await fs.writeJson(reportPath, report, { spaces: 2 });
            console.log(`📋 Distribution report saved to: ${reportPath}`);
            
        } catch (error) {
            console.error('❌ Error saving distribution report:', error);
        }
    }
}